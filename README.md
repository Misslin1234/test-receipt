# test-receipt

AI 编程助手有时会说「测试通过了」，其实并没有跑测试。test-receipt 让测试真的执行一次，并把结果写成一张本地收据。没有一张对应当前 git 提交和工作区、而且退出码是 0 的收据，助手就不该说测试通过。

v1 很小：一个没有依赖的 Node.js 命令、一份 [Agent Skill](skills/test-receipt/SKILL.md)，以及一个回合结束时的 Stop hook。不联网，也不调用付费 API。

## 它解决什么问题

助手的最后一句话经常是「All tests pass」或「测试通过」。读者很难分清这是刚跑过的结果，还是随口说的。test-receipt 把「跑过」变成一个文件：

1. 在项目根目录找出真正的测试命令。
2. 运行它们，写入 `.test-receipt/latest.json`（命令、退出码、开始和结束时间、耗时、当前 commit、工作区是否有未提交改动）。
3. Skill 告诉助手：没有新鲜的成功收据，就说测试没跑，或者说测试失败了。
4. Stop hook 在回合结束时读助手的最后一句话。如果它声称测试通过，但收据缺失、过期或失败，就拦住这一回合。

Hook 不会替你跑测试。跑测试的是 `test-receipt run`。

## 它不做什么

[ThruLine](https://github.com/thrulinehq/thruline) 会读助手已经写在磁盘上的会话日志，并在 PATH 上放一层命令包装器来记录每次运行。 [norma](https://github.com/jcarlosrodicio/norma) 会在仓库里装上一整套任务流程，并用 git pre-commit 拦住没有盖章的提交。

v1 不读会话日志，不包装 `pytest` / `npm`，也不拦 `git commit`。收据只是一份普通 JSON，没有签名。

## 30 秒安装

你需要：

- Node.js 18 或更新（用来执行本工具；不需要 `npm install`）
- git
- 你的测试命令本身要能在本机运行，例如 `npm test` 需要 npm

把本仓库克隆到一个固定位置：

```bash
git clone https://github.com/Misslin1234/test-receipt.git "$HOME/test-receipt"
```

下面的命令在**你要保护的项目**根目录执行。

### 1. 装上技能

技能遵循 [Agent Skills](https://agentskills.io/specification)。`name` 是 `test-receipt`，和目录名一致。

Claude Code 读项目里的 `.claude/skills/`（[文档](https://code.claude.com/docs/en/skills)）：

```bash
mkdir -p .claude/skills
cp -R "$HOME/test-receipt/skills/test-receipt" .claude/skills/test-receipt
```

同一份目录还可以拷到这些已经核对过的位置：

| 产品 | 项目内路径 | 依据 |
| --- | --- | --- |
| Cursor | `.cursor/skills/test-receipt/` 或 `.agents/skills/test-receipt/`。Cursor 也会读 `.claude/skills/` | [cursor.com/docs/skills](https://cursor.com/docs/skills) |
| Qoder | `.qoder/skills/test-receipt/` | [docs.qoder.com/extensions/skills](https://docs.qoder.com/extensions/skills) |

Codex 的技能目录，这次没有从 Codex 自己的文档里核对到，所以这里不写死路径。Codex 的 **hook** 路径是核对过的，见下一步。

### 2. 装上 Stop hook

Claude Code 的配置文件是 `.claude/settings.json`（[Hooks 文档](https://code.claude.com/docs/en/hooks)）。Stop 事件的输入里有 `last_assistant_message`。拦住回合的写法是退出码 0，并打印 `{"decision":"block","reason":"..."}`。

```bash
mkdir -p .claude
node "$HOME/test-receipt/bin/cli.js" print-hook claude > .claude/settings.json
```

如果这个文件里已经有别的配置，不要直接覆盖。命令把说明打到 stderr，把 JSON 打到 stdout。把其中的 `Stop` 数组合并进现有的 `hooks`。

Codex 和 Qoder 的 Stop 事件同样带有 `last_assistant_message`，拦住的 JSON 也是 `decision` + `reason`：

```bash
mkdir -p .codex .qoder
node "$HOME/test-receipt/bin/cli.js" print-hook codex > .codex/hooks.json
node "$HOME/test-receipt/bin/cli.js" print-hook qoder > .qoder/settings.json
```

| 产品 | 配置文件 | 文档 |
| --- | --- | --- |
| Claude Code | `.claude/settings.json` | [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) |
| Codex | `.codex/hooks.json` | [learn.chatgpt.com/docs/hooks](https://learn.chatgpt.com/docs/hooks) |
| Qoder | `.qoder/settings.json` | [docs.qoder.com/extensions/hooks](https://docs.qoder.com/extensions/hooks) |
| Cursor | 不生成配置。`print-hook cursor` 会退出码 2，并说明 **not yet supported** | [cursor.com/docs/hooks](https://cursor.com/docs/hooks) |

Cursor 的 `stop` 输入只有 `status` 和 `loop_count`，没有助手最后一句话。`afterAgentResponse` 有正文，但文档没有给出拦住或继续回合的输出字段。Cursor 可以加载 Claude Code 的 Stop hook，并把 `decision: "block"` 映射成 `followup_message`（[第三方 hook](https://cursor.com/docs/reference/third-party-hooks)）。输入里没有 `last_assistant_message` 时，本工具放行，不会去猜，也不会去读聊天记录。

### 3. 跑一次

```bash
node "$HOME/test-receipt/bin/cli.js" run
node "$HOME/test-receipt/bin/cli.js" check
```

`check` 打印 `fresh: yes` 并且退出码是 0，才表示现在可以说测试通过。

第一次运行如果发现 `.test-receipt/` 还没被忽略，会在项目的 `.gitignore` 末尾加一行。请把这一行提交进仓库。收据文件不要提交。提交之后 commit 变了，旧收据作废，需要再 `run` 一次。

## 收据示例

`examples/mini` 是一个只有 `assert.equal(1 + 1, 2)` 的小项目。在它的临时副本里，`run` 写出的文件是这种形状（commit 和指纹每次不同）：

```json
{
  "schemaVersion": 1,
  "tool": "test-receipt",
  "toolVersion": "0.2.1",
  "ok": true,
  "exitCode": 0,
  "command": "npm test",
  "startedAt": "2026-11-27T04:54:36.338Z",
  "endedAt": "2026-11-27T04:54:36.453Z",
  "durationMs": 115,
  "commands": [
    {
      "command": "npm test",
      "source": "npm",
      "exitCode": 0,
      "startedAt": "2026-11-27T04:54:36.338Z",
      "endedAt": "2026-11-27T04:54:36.453Z",
      "durationMs": 115,
      "outputTail": "\n> test\n> node check.js\n\nmini ok\n"
    }
  ],
  "git": {
    "inGit": true,
    "commit": "e82b95acabcd5abe3013ec869a0d1bdaf1e37c24",
    "dirty": false,
    "treeFingerprint": "sha256:90fdbe48c3bb787551fd1ce83e62967ac1c8269002ff871d32d4447eaab9f55a"
  }
}
```

`command` 是展示用的字符串。真正的结果在 `commands` 数组里。多个命令都会跑，中间用 `"; "` 连起来，并不是 shell 的 `&&`（前面的失败不会取消后面的命令）。

指纹在测试命令结束之后计算。测试写出的、没有被 git 忽略的文件（例如 coverage.txt）算进这张收据。之后再改文件，收据就过期。被 git 忽略的文件不会让收据过期。仓库里任何位置的 `.test-receipt/` 都不算进指纹。

`run` 把收据写在它运行的那个目录。`check` 和 Stop hook 从当前目录向上找，直到 git 仓库根目录，用最近的一份 `.test-receipt/latest.json`。仓库根目录之外的收据不算。

## 一句假话会被拦住

没有收据时，助手如果说 “All tests pass.” 或 “测试通过。”，hook 打印类似：

```json
{"decision":"block","reason":"test-receipt: do not claim tests passed.\nStatus: no-receipt. No .test-receipt/latest.json file exists yet.\n..."}
```

改过文件之后，同一句会变成 `dirty-mismatch`（工作区从干净变成有改动）。测试退出码不是 0 时是 `exit-nonzero`。收据是别的 commit 上的，则是 `commit-mismatch`。

“Tests failed with exit code 1.” 和 “I did not run the tests.” 不会被拦。Hook 只认「说通过了」。技能仍然要求失败和「没跑」这两句是真话。

`stop_hook_active` 为 true 时（说明上一轮已经被这个 hook 拦住过），脚本不再次 `block`，只写一条 `systemMessage`。Claude Code、Codex、Qoder 的文档都要求这样，避免无限循环。助手不该靠这个空子把假话再说一遍。

## 怎样才算新鲜

`check` 只有在下面全部成立时才打印 `fresh: yes`：

- 收据的 `ok` 是 true，`exitCode` 是 0
- `git.commit` 等于现在的 `HEAD`（还没有提交时，两边都是空）
- `git.dirty` 和现在一致：有没有未提交的改动
- `git.treeFingerprint` 一致，包括那些改动文件的内容

不是 git 仓库时，收据可以写下来，但永远不算新鲜。这时 `run` 会在 stderr 打一行警告。

`--cwd` 在子目录时，指纹仍覆盖整个 git 仓库，路径相对仓库根目录。子目录里的改动，以及子目录外面的共享代码，都会让收据过期。

| `check` 的 reason | 含义 |
| --- | --- |
| `fresh` | 可以声称测试通过 |
| `no-receipt` | 还没有收据 |
| `exit-nonzero` | 跑过，但失败了 |
| `commit-mismatch` | 收据属于另一个提交 |
| `dirty-mismatch` | 工作区干净/脏的状态变了 |
| `fingerprint-mismatch` | 文件内容变了（状态可能仍是 dirty） |
| `not-a-git-repo` | 当前目录不是 git 仓库 |
| `bad-receipt` | 文件坏了，或少了必要字段 |
| `git-error` | `git status` 失败 |

## 能认出哪些测试命令

只看项目根目录。下表里对得上的都会加入列表，顺序固定。想先看会跑哪条命令、为什么，而不真正执行：

```bash
node "$HOME/test-receipt/bin/cli.js" detect
```

默认打出人能读的几行：`would run`、`source`、`why`。加 `--json` 则打出 JSON，每条命令带 `reason`。找不到命令时退出码仍是 0，说明写在 stderr。这个命令不会运行测试，也不会写收据。

JavaScript 那一行和 Bun 那一行不会同时出现，见表格下面的规则。其余行只要文件在，就会各加一条。Ruby 的两行可以同时出现，`rspec` 在前。

| 顺序 | 看到什么 | 运行 | JSON 里的 source |
| --- | --- | --- | --- |
| 1 | `package.json` 里有真正的 `scripts.test`，并且没有被 Bun 规则抢走 | `pnpm test`、`yarn test` 或 `npm test`。锁文件优先级是 `pnpm-lock.yaml`，然后 `yarn.lock`，然后 `package-lock.json`，然后 `npm-shrinkwrap.json`。都没有时看 `packageManager`，再没有就用 npm | `pnpm`、`yarn` 或 `npm` |
| 1 | `bun.lockb` 或 `bun.lock`（`bun.lockb` 优先写进 why） | `bun test` | `bun` |
| 2 | `deno.json`，否则 `deno.jsonc` | `deno test` | `deno` |
| 3 | `pytest.ini`、`pyproject.toml` 里的 `[tool.pytest`、`setup.cfg` / `tox.ini` 的 pytest 段，或 `test_*.py` / `*_test.py` / `conftest.py` | `pytest` | `pytest` |
| 4 | `go.mod` | `go test ./...` | `go` |
| 5 | `Cargo.toml` | `cargo test` | `cargo` |
| 6 | `Makefile`、`makefile` 或 `GNUmakefile` 里行首的 `test:` | `make test` | `make` |
| 7 | `pom.xml`。旁边有文件 `mvnw` 时用包装器 | `./mvnw test`，否则 `mvn test` | `maven` |
| 8 | `build.gradle` 或 `build.gradle.kts`。旁边有文件 `gradlew` 时用包装器 | `./gradlew test`，否则 `gradle test` | `gradle` |
| 9 | 根目录的 `*.sln`，没有解决方案时才看 `*.csproj` | `dotnet test` | `dotnet` |
| 10 | `Gemfile`，并且 `spec/` 是目录 | `bundle exec rspec` | `rspec` |
| 11 | `Gemfile`，并且有文件 `Rakefile` | `bundle exec rake test` | `rake` |
| 12 | `phpunit.xml`，否则 `phpunit.xml.dist` | `vendor/bin/phpunit` | `phpunit` |

Bun 和 npm / pnpm / yarn 二选一：

- 有真正的 `scripts.test`，同时又有 `pnpm-lock.yaml`、`yarn.lock`、`package-lock.json`、`npm-shrinkwrap.json` 其中之一：用对应的包管理器，即使旁边还有 `bun.lock` 或 `bun.lockb`。这是 0.1.0 的选法，Bun 不会再插一条。
- 有 Bun 的锁文件，但没有上面这些 Node 锁文件：用 `bun test`。这时即使 `package.json` 写了 `scripts.test`，或者 `packageManager` 写了 pnpm / yarn / npm，也不跑 `npm test`。
- 没有 Bun 锁文件：和 0.1.0 一样。占位脚本 `echo "Error: no test specified" && exit 1` 仍会忽略。没有锁文件时看 `packageManager`，再没有就用 `npm test`。`packageManager` 写成 `bun@…` 但没有 Bun 锁文件时，也仍是 `npm test`，因为 Bun 只认 `bun.lockb` / `bun.lock`。

只写了 `Gemfile`、只写了 `spec/`、或只写了 `Rakefile`，都不会当成 Ruby。`mvnw` 和 `gradlew` 必须是文件；只有包装器、没有 `pom.xml` 或 Gradle 构建文件，不会选中。`mvnw.cmd` 和 `gradlew.bat` 单独出现时，仍用 `mvn test` / `gradle test`。同一个目录里有好几个 `.sln` 或 `.csproj` 时，命令只加一次，why 里写按文件名排序后的第一个。子目录里的标记文件不算。缩进在配方里的 `test:` 不算 make 目标。

`why` 会写出决定性的文件名，例如 `package.json scripts.test and package-lock.json`、`pom.xml and mvnw`、`Gemfile and spec/`。

命令不对时，在项目根目录写 `.test-receipt.json`，它会代替自动检测：

```json
{ "commands": ["npm test"] }
```

也可以只跑一次指定命令：`node bin/cli.js run --cmd "npm test"`。

## 局限

- Hook 按句子判断，不是语言模型。一句要同时有通过类的词和测试类的词，才算声称通过。通过类的词包括 pass、passed、passing、green、succeed、通过、全绿。测试类的词包括 test、suite、pytest、jest、vitest、cargo test、go test、checks、测试、用例。
- 否定或不确定就不算，包括 not、no、couldn't、can't、haven't、didn't、unable、failed、未、没有、无法、不。“I couldn't confirm that the tests pass.”、“Not all tests pass.”、“No tests passed.” 和 “Tests failed with exit code 1.” 不会被拦。换一种说法仍可能漏过。引用「tests passed」也可能被拦。
- Hook 不核对「测试失败了」或「测试没有运行」。这两句可以是假的。
- 助手可以手写 `.test-receipt/latest.json` 来骗过 hook。技能禁止这样做。v1 没有签名，做不到真正防伪。
- 只检测根目录。单体仓库里的子包不会单独识别。
- 测试命令必须自己退出。v1 没有超时。
- 收据里的 `outputTail` 只保留输出末尾大约 2000 个字符，可能含有日志。文件在本地，并且应该被 gitignore。
- 检测到的每一条命令都会跑，即使前面一条已经失败。
- 一次新的提交（包括只提交 `.gitignore`）会让收据过期。
- `stop_hook_active` 为 true 时不再拦住第二次。平台自己有连续拦住的上限（Claude Code 文档里是连续 8 次）。
- Cursor 的「拦住假话」还没做，见上面的表格。
- 退出码 0 只说明命令退出了，不说明测试有意义，也不说明覆盖了这次改动。

## 路线图

- Cursor：等官方 `stop` 事件带上助手的最后一句话再接。仍然不解析聊天记录。
- 可选的收据签名，让手写 JSON 更难蒙混。签名也挡不住能读到密钥的助手，所以这不是完全的防伪。
- 只跑和本次改动相关的测试。
- 给 `run` 加一个超时。

## 开发和示例

```bash
npm test
bash script/demo.sh
node bin/cli.js detect
```

`npm test` 就是 `node --test`，测试这个工具自己。`script/demo.sh` 把 `examples/mini` 拷到临时目录：没有收据时拦住中英文的「通过」，跑完 `npm test` 后放行，改文件后因为过期再拦住，把断言改坏后再拦住「All tests pass」，并放行「Tests failed...」。脚本自己检查这些结果，不对就退出码非 0。`detect` 只打印会跑的命令和原因。

许可证是 MIT，版权 Misslin1234。

---

# English

Coding agents sometimes say “tests pass” without running them. test-receipt runs the project’s real test command and writes a local receipt. The agent may claim success only when that receipt is fresh for the current git commit and working tree and the exit code is 0.

v1 is a dependency-free Node.js CLI, one [Agent Skill](skills/test-receipt/SKILL.md), and a Stop hook. No network calls and no paid APIs.

## What it does

1. Detect test commands at the project root.
2. Run them and write `.test-receipt/latest.json`: command, exit code, start and end time, duration, git commit, and whether the working tree was dirty.
3. The skill tells the agent to say “not run” or “failed” when there is no fresh passing receipt.
4. The Stop hook reads the final message. A pass claim with a missing, stale, or failed receipt blocks the stop.

The hook does not run the tests. `test-receipt run` does.

## What it does not do

[ThruLine](https://github.com/thrulinehq/thruline) reads the session logs an agent already writes, and can record runs through PATH shims. [norma](https://github.com/jcarlosrodicio/norma) installs a task loop and a git pre-commit gate.

v1 does not read transcripts, wrap `pytest` or `npm`, or block `git commit`. The receipt is plain JSON. It is not signed.

## 30-second install

Requirements: Node.js 18+, git, and whatever your test command needs (`npm test` needs npm). There is no `npm install` for this tool.

```bash
git clone https://github.com/Misslin1234/test-receipt.git "$HOME/test-receipt"
```

Run the rest from the project you want to protect.

```bash
mkdir -p .claude/skills .claude
cp -R "$HOME/test-receipt/skills/test-receipt" .claude/skills/test-receipt
node "$HOME/test-receipt/bin/cli.js" print-hook claude > .claude/settings.json
```

Do not overwrite an existing settings file. Merge the printed `Stop` entry into `hooks`. Notes go to stderr; JSON goes to stdout.

| Host | Skill directory (verified) | Stop hook |
| --- | --- | --- |
| Claude Code | `.claude/skills/test-receipt/` | `.claude/settings.json` via `print-hook claude` |
| Codex | skill directory not verified from Codex’s own docs in this release | `.codex/hooks.json` via `print-hook codex` ([docs](https://learn.chatgpt.com/docs/hooks)) |
| Qoder | `.qoder/skills/test-receipt/` | `.qoder/settings.json` via `print-hook qoder` ([docs](https://docs.qoder.com/extensions/hooks)) |
| Cursor | `.cursor/skills/` or `.agents/skills/` (also loads `.claude/skills/`) | **not yet supported.** `stop` input is `status` and `loop_count` only ([docs](https://cursor.com/docs/hooks)). This tool does not parse transcripts. |

Claude Code, Codex, and Qoder all pass `last_assistant_message` and accept `{"decision":"block","reason":"..."}` with exit code 0.

```bash
node "$HOME/test-receipt/bin/cli.js" run
node "$HOME/test-receipt/bin/cli.js" check
```

`fresh: yes` and exit code 0 means a pass claim is allowed. The first run may append `.test-receipt/` to `.gitignore`. Commit that line, not the receipt. The new commit makes the receipt stale, so run the tests again.

## Example receipt

`examples/mini` only checks `1 + 1 === 2`. A real `run` on a temporary copy looks like this (the commit and fingerprint change every time):

```json
{
  "schemaVersion": 1,
  "tool": "test-receipt",
  "toolVersion": "0.2.1",
  "ok": true,
  "exitCode": 0,
  "command": "npm test",
  "startedAt": "2026-11-27T04:54:36.338Z",
  "endedAt": "2026-11-27T04:54:36.453Z",
  "durationMs": 115,
  "commands": [
    {
      "command": "npm test",
      "source": "npm",
      "exitCode": 0,
      "durationMs": 115,
      "outputTail": "\n> test\n> node check.js\n\nmini ok\n"
    }
  ],
  "git": {
    "inGit": true,
    "commit": "e82b95acabcd5abe3013ec869a0d1bdaf1e37c24",
    "dirty": false,
    "treeFingerprint": "sha256:90fdbe48c3bb787551fd1ce83e62967ac1c8269002ff871d32d4447eaab9f55a"
  }
}
```

`commands` is authoritative. `command` is those commands joined with `"; "` for display. Every detected command runs, including after an earlier failure.

The fingerprint is taken after the test commands finish. An un-ignored file a command writes, such as coverage.txt, is part of that receipt. A later edit makes the receipt stale. Gitignored files do not. Any `.test-receipt/` directory in the repository is excluded.

`run` writes the receipt in the directory it runs in. `check` and the Stop hook walk up from the working directory to the git toplevel and use the nearest `.test-receipt/latest.json`. A receipt outside the repository does not count.

## A blocked false claim

With no receipt, “All tests pass.” or “测试通过。” makes the hook print:

```json
{"decision":"block","reason":"test-receipt: do not claim tests passed.\nStatus: no-receipt. No .test-receipt/latest.json file exists yet.\n..."}
```

An edit after a clean run is `dirty-mismatch`. A non-zero exit is `exit-nonzero`. A different commit is `commit-mismatch`. “Tests failed with exit code 1.” is allowed. The hook only gates pass claims. The skill still requires failure and “not run” sentences to be true.

When `stop_hook_active` is true, the hook does not block again. It emits a `systemMessage` so the host does not loop. That is what the Claude Code, Codex, and Qoder docs require.

## Fresh

`check` prints `fresh: yes` only when `ok` is true, `exitCode` is 0, `git.commit` matches `HEAD`, `git.dirty` matches, and `git.treeFingerprint` matches (dirty file contents included). A directory that is not a git repo is never fresh. `run` prints one warning on stderr in that case.

With `--cwd` in a subdirectory, the fingerprint still covers the whole git repository, with paths relative to the toplevel. An edit in that subdirectory, and an edit to shared code outside it, both make the receipt stale.

## Detection

Root only. Every matching row is kept, in this order. JavaScript and Bun are alternatives, so only one of those two commands is added. Ruby can add both rows, rspec first.

```bash
node bin/cli.js detect
```

The default output is `would run`, `source`, and `why`. `--json` prints the same result, and each command includes `reason`. Exit code is 0 even when nothing matches; the hint goes to stderr. `detect` does not run tests and does not write a receipt.

| Order | Marker | Command | `source` |
| --- | --- | --- | --- |
| 1 | Real `package.json` `scripts.test`, unless Bun wins (below) | `pnpm test`, `yarn test`, or `npm test`. Lockfile order: `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `npm-shrinkwrap.json`, then `packageManager`, otherwise npm | `pnpm`, `yarn`, or `npm` |
| 1 | `bun.lockb` or `bun.lock` (`bun.lockb` is cited first) | `bun test` | `bun` |
| 2 | `deno.json`, otherwise `deno.jsonc` | `deno test` | `deno` |
| 3 | `pytest.ini`, `[tool.pytest` in `pyproject.toml`, a pytest section in `setup.cfg` / `tox.ini`, or `test_*.py` / `*_test.py` / `conftest.py` | `pytest` | `pytest` |
| 4 | `go.mod` | `go test ./...` | `go` |
| 5 | `Cargo.toml` | `cargo test` | `cargo` |
| 6 | A top-level `test:` in `Makefile`, `makefile`, or `GNUmakefile` | `make test` | `make` |
| 7 | `pom.xml`. A `mvnw` file selects the wrapper | `./mvnw test`, otherwise `mvn test` | `maven` |
| 8 | `build.gradle` or `build.gradle.kts`. A `gradlew` file selects the wrapper | `./gradlew test`, otherwise `gradle test` | `gradle` |
| 9 | A root `*.sln`, or a root `*.csproj` when there is no solution | `dotnet test` | `dotnet` |
| 10 | `Gemfile` and a `spec/` directory | `bundle exec rspec` | `rspec` |
| 11 | `Gemfile` and a `Rakefile` file | `bundle exec rake test` | `rake` |
| 12 | `phpunit.xml`, otherwise `phpunit.xml.dist` | `vendor/bin/phpunit` | `phpunit` |

Bun versus npm, pnpm, and yarn:

- A real `scripts.test` plus `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, or `npm-shrinkwrap.json` selects that package manager. A Bun lockfile beside it does not add `bun test`. This is the 0.1.0 choice.
- A Bun lockfile and none of those Node lockfiles selects `bun test`, even when `scripts.test` or `packageManager` names npm, pnpm, or yarn.
- With no Bun lockfile, detection matches 0.1.0. The placeholder `echo "Error: no test specified" && exit 1` is ignored. An indented `test:` inside a recipe is not a Make target. `packageManager` set to `bun@…` without a Bun lockfile is still `npm test`: Bun is recognized only from `bun.lockb` or `bun.lock`.

`Gemfile` alone, `spec/` alone, or `Rakefile` alone is not Ruby. `mvnw` and `gradlew` must be files. `mvnw.cmd` or `gradlew.bat` alone does not change `mvn test` / `gradle test`. Several `.sln` or `.csproj` files add `dotnet test` once; `why` names the first filename in sorted order. `build.gradle` is cited before `build.gradle.kts`. Markers in subdirectories do not count.

`why` names the deciding file, for example `package.json scripts.test and package-lock.json`, `pom.xml and mvnw`, or `Gemfile and spec/`.

Override with `.test-receipt.json`:

```json
{ "commands": ["npm test"] }
```

## Limitations

- The hook judges each sentence by its words. A sentence is a pass claim when it has a pass word and a test word. Pass words include pass, passed, passing, green, succeed, 通过, and 全绿. Test words include test, suite, pytest, jest, vitest, cargo test, go test, checks, 测试, and 用例.
- Negation or uncertainty keeps the sentence allowed. That includes not, no, couldn't, can't, haven't, didn't, unable, failed, 未, 没有, 无法, and 不. "I couldn't confirm that the tests pass.", "Not all tests pass.", "No tests passed.", and "Tests failed with exit code 1." are allowed. A paraphrase can still slip through, and a quoted "tests passed" can be flagged.
- “Tests failed” and “tests were not run” are not checked.
- A hand-written receipt fools the hook. The skill forbids that. v1 has no signature.
- Root-only detection. The test command must exit. There is no timeout.
- `outputTail` keeps about the last 2000 characters and may contain logs.
- A new commit, including the `.gitignore` line, stales the receipt.
- Cursor claim checking is not yet supported.
- Exit code 0 does not mean the tests were meaningful or covered the edit.

## Roadmap

- Cursor, when the documented `stop` payload includes the assistant message. Still no transcript parsing.
- Optional signing. An agent that can read the key can still forge a receipt.
- Test selection based on the diff.
- A timeout for `run`.

## Develop

```bash
npm test
bash script/demo.sh
node bin/cli.js detect
```

`script/demo.sh` copies `examples/mini` to a temp git repo and checks four outcomes: a missing receipt blocks English and Chinese pass claims, a fresh receipt allows the claim, an edit blocks it again, and a failing test blocks “All tests pass” while allowing “Tests failed...”. The script exits non-zero if any of those checks is wrong. `detect` only prints the command and the reason.

MIT License. Copyright Misslin1234.
