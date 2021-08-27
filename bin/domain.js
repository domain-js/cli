#! /usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { exec } = require("child_process");
const async = require("async");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
  prompt: "> ",
  removeHistoryDuplicates: true,
});
rl.setPrompt("> ");

const _require = require;

const confirm = async (question) =>
  new Promise((resolve) => {
    rl.question(`${question} [Yes/no]: `, (ans) => resolve(ans.toLowerCase() !== "no"));
    rl.setPrompt("> ");
  });

const getAnswers = async (questions) => {
  const data = {};

  await async.eachSeries(questions, async ([question, key, defaultValue]) => {
    data[key] = await new Promise((resolve) => {
      const msg = [`${question}[${key}]:`];
      if (defaultValue != null) msg.push(`Default: ${defaultValue}`);
      rl.question(`${msg.join("\n")} `, resolve);
    });

    if (defaultValue != null && !data[key]) data[key] = defaultValue;
  });

  return data;
};

const showMessage = (msg, exit) => {
  rl.output.write(`${msg}\n`);
  if (exit != null) process.exit(exit);
  rl.setPrompt("> ");
};

const init = async () => {
  showMessage("初始化一个新的 domain.js 项目的 domain 模块");
  const questions = [["输入项目路径", "dir"]];
  const data = await getAnswers(questions);
  const ok = await confirm(`确定创建在 ${data.dir || "当前"} 目录吗?`);
  if (!ok) return init();

  const commands = [
    `git clone 'https://github.com/domain-js/domain-boilerplate.git' ${data.dir}`,
    `cd ${data.dir}`,
    `rm -rf ${data.dir}./.git`,
  ].join(" && ");

  showMessage("------ The following command will be executed ------");
  showMessage(commands);

  return new Promise((resolve, reject) => {
    exec(commands, (err, stdout, stderr) => {
      if (stdout) showMessage(stdout);
      if (stderr) showMessage(stderr);
      if (err) return reject(err);
      return resolve();
    });
  });
};

const pubDeps = async () => {
  showMessage("初始化一个通用模块插件");
  const questions = [
    ["输入项目路径", "dir"],
    ["输入通用模块名称", "name"],
  ];
  const data = await getAnswers(questions);
  const ok = await confirm(`确定创建在 ${data.dir || "当前"} 目录吗?`);
  if (!ok) return init();
  if (data.dir.slice(-1) === "/") data.dir = data.dir.slice(0, -1);

  const commands = [
    `git clone 'https://github.com/domain-js/pub-deps-boilerplate.git' ${data.dir}`,
    `cd ${data.dir}`,
    `rm -rf .git`,
    `sed -i.bak "s/DEPS_NAME/${data.name}/g" *`,
    `rm *.bak`,
  ].join(" && ");

  showMessage("------ The following command will be executed ------");
  showMessage(commands);

  return new Promise((resolve, reject) => {
    exec(commands, (err, stdout, stderr) => {
      if (stdout) showMessage(stdout);
      if (stderr) showMessage(stderr);
      if (err) return reject(err);
      return resolve();
    });
  });
};

const deps = async () => {
  showMessage("初始化一个项目私有模块");
  const questions = [
    ["输入项目 domain 模块根路径", "dir", ""],
    ["输入模块名称", "name"],
  ];
  const data = await getAnswers(questions);
  const ok = await confirm(`确定创建在 ${data.dir || "./"}src/deps/${data.name} 目录吗?`);
  if (!ok) return init();
  if (data.dir.slice(-1) === "/") data.dir = data.dir.slice(0, -1);

  const target = `${data.dir || "."}/src/deps/${data.name}`;
  if (fs.existsSync(target))
    return showMessage(`目录(${target})已经被占用，为避免冲突，只能创建在不存在的目录中`);

  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  fs.mkdirSync(target);

  const commands = [
    `git clone 'https://github.com/domain-js/deps-boilerplate.git' ${target}`,
    `cd ${target}`,
    `rm -rf .git`,
    `sed -i.bak "s/DEPS_NAME/${data.name}/g" *`,
    `rm *.bak`,
  ].join(" && ");

  showMessage("------ The following command will be executed ------");
  showMessage(commands);

  return new Promise((resolve, reject) => {
    exec(commands, (err, stdout, stderr) => {
      if (stdout) showMessage(stdout);
      if (stderr) showMessage(stderr);
      if (err) return reject(err);
      return resolve();
    });
  });
};

const makeDefineFile = async (modules, rootDir, isTS) => {
  const ext = isTS ? "ts" : "js";
  const targetFile = path.resolve(rootDir, `src/deps-defines.${ext}`);
  const content = ["// domain-cli loadDeps 自动生成"];
  const _exports = [];
  for (let i = 0; i < modules.length; i += 1) {
    const name = modules[i];
    if (isTS) {
      content.push(`import * as module${i} from "./deps/${name}"`);
    } else {
      content.push(`const module${i} = require("./deps/${name}")`);
    }
    _exports.push(`"${name}": module${i},`);
  }

  // 处理导出
  content.push("\n");
  if (isTS) {
    content.push("export = {");
  } else {
    content.push("module.exports = {");
  }

  for (const x of _exports) content.push(x);
  content.push("};");

  fs.writeFileSync(targetFile, content.join("\n"));
  await new Promise((resolve, reject) => {
    exec(`prettier -w ${targetFile}`, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log(`Completed: ${targetFile}`);
};

const checkHookExport = (_dir) => {
  for (const hook of ["Before", "After"]) {
    const TSFile = path.resolve(_dir, `${hook}.ts`);
    const JSFile = path.resolve(_dir, `${hook}.js`);

    if (fs.existsSync(TSFile) && !fs.existsSync(JSFile)) {
      throw Error(`请先编辑ts文件: ${_dir}`);
    }
    const Main = _require(_dir);
    if (fs.existsSync(JSFile)) {
      const Hook = _require(JSFile);
      if (Main[hook] !== Hook) throw Error(`${hook} 定义和 export 不一致 ${_dir}`);
    }
  }
};

const loadDeps = async (rootDir = process.cwd(), ext = "js") => {
  const isTS = ext === "ts";
  const modules = [];
  const dir = path.resolve(rootDir, "src/deps/");
  for (const x of fs.readdirSync(dir)) {
    // 忽略隐藏目录
    if (x[0] === ".") continue;
    const _dir = path.resolve(dir, x);
    const stat = fs.statSync(_dir);

    // 非目录忽略，模块必须是目录
    if (!stat.isDirectory()) continue;
    checkHookExport(_dir, isTS);

    modules.push(x);
  }

  // 按字典排序，后续有变动的时候不容易冲突
  await makeDefineFile(modules.sort(), rootDir, isTS);
};

const actions = { init, pubDeps, deps, loadDeps };

const main = async (command = "init") => {
  const action = actions[command];
  if (!action) {
    const msg = `${action} 不存在该指令，只支持 ${Object.keys(actions)}`;
    return showMessage(msg, 0);
  }
  try {
    await action(...process.argv.slice(3));
  } catch (e) {
    showMessage(e.message, 1);
  }
  return process.exit(0);
};

main(process.argv[2]);

process.on("uncaughtException", (error) => {
  console.error("[%s]: uncaughtException", new Date());
  console.error(error);
});

process.on("unhandledRejection", (reason, p) => {
  console.error("[%s]: unhandledRejection", new Date());
  console.error(reason, p);
});

process.on("rejectionHandled", (error) => {
  console.error("[%s]: rejectionHandled", new Date());
  console.error(error);
});
