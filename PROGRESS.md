# Progress

## M1: Platform Adapter 抽象与现有行为迁移

打算怎么做：先盘点 phodex-bridge 现有入口、daemon/up/logs/status 相关代码和测试，找出所有平台相关行为的实际边界；然后加入 `src/platform` 抽象骨架，把 macOS 现有 launchd/前台运行/日志/status 行为迁入 `DarwinDaemonManager` 等子接口，把 Linux 现有行为迁入 `LinuxAdapter`，保持 CLI 对外命令和默认路径不变；最后补单元/回归测试，实际运行 M1 四项验收，包括 macOS `up` 零差异验证、Linux 行为验证和 npm test 全绿。若当前机器无法覆盖 macOS 实跑，会把阻塞写清楚并要求真实 macOS 环境补跑，不能把它伪装成已验收。

当前进展：M1 已完成并放行。adapter 抽象骨架、`DarwinDaemonManager`、`LinuxAdapter` 与平台子接口迁移已落到 `f824299 WIP-M1-unverified`，随后通过 amend 补齐 commit body 和文档记录。GitHub Actions `M1 Validation` 已在 `macos-latest`、`ubuntu-latest`、`windows-latest` 三平台跑绿，覆盖 `npm test` 与 `process.platform` 所有权检查；M1 阶段不再有待办阻塞项。M2 后新增的 macOS launchd 端到端 smoke 会在当前 cleanup workflow 中继续验证 `remodex up -> launchctl list -> remodex stop`，用于确认 M2 没有破坏 M1 的 Mac 零退化承诺。

结构偏离记录：M1 当前在上游 Remodex 单仓库 fork 中推进，实际工作目录是 `.upstream-remodex/phodex-bridge`，没有先搭 Aremodex monorepo 和 `packages/phodex-bridge/`。这是基于 M1 只改 bridge、当前工作区没有 Android 代码、且需要尽快让 macOS/Linux/Windows CI 验证 adapter 迁移的阶段性判断；它不是对最终仓库结构的永久决策。Beyond M5、开始接入 Android 客户端代码前，必须重新评估是否升级到 monorepo，并确认 bridge fork 与 Aremodex app 的版本号、发布节奏和 CI 边界如何解耦。

## M2: Windows Adapter 最小前台版

打算怎么做：先在现有 `src/platform` 结构下新增 Windows adapter 和三个子接口的最小实现，保持 M2 只做前台运行，不引入 Task Scheduler、WinSW 或托盘；然后把 `aremodex-bridge` CLI alias 接上现有 CLI，新增 `diagnose` 和 Windows foreground 预检，让编码、路径、Codex runtime 探测、防火墙风险提示都集中在 Windows adapter 内。实现时若发现 v2 设计细节不可行，先在本节记录调整理由再改代码。验收会分三层：本机 Windows 跑 `npm test` 和 CLI 诊断；PowerShell 与真实 `cmd.exe` 各跑一次 `aremodex-bridge run` 到 relay 连接阶段并保存终端 log，专门观察 GBK/UTF-8 下 QR 与中文/特殊字符；最后在干净 Windows 11 用户上首次运行 loopback/self-host 流程验证不触发 Defender Firewall 弹窗。GitHub Actions 只能覆盖测试矩阵，不能替代后两项手工验收。

当前进展：已实现 `src/platform/windows/` 最小前台 adapter，并接入 `aremodex-bridge` CLI alias、`diagnose`、Windows 控制台编码预检、路径诊断、Defender Firewall 诊断和原生/WSL/桌面 Codex 探测。本机 Windows 下 `phodex-bridge` 已跑 `npm test`，结果 189/189 通过；`process.platform` 检查仍只有 `phodex-bridge/src/platform/index.js` 一处命中。`aremodex-bridge diagnose --json` 已实跑，能显示原生 Codex、WSL 未安装状态、Codex 桌面应用、`%USERPROFILE%\.codex`、路径长度和 firewall 诊断。PowerShell 与真实 `cmd.exe /d /c` 均已在先切到 GBK 代码页的 smoke 中跑 `aremodex-bridge run` 到 relay connected 阶段，旧日志保存在 `C:\Aremodex(codex版）\m2-validation-logs\powershell-run.log` 和 `C:\Aremodex(codex版）\m2-validation-logs\cmd-run.log`。本次 cleanup 已完全移除旧的用户可见 env 测试开关，改由 `scripts/windows-console-smoke.js` 通过 `createPlatformAdapter` 依赖注入调用 `prepareForegroundRun({ forceConsole: true })`；PowerShell 与真实 `cmd.exe /d /c` 重新实跑后日志保存在 `C:\Aremodex(codex版）\m2-validation-logs\powershell-run-injected.log` 和 `C:\Aremodex(codex版）\m2-validation-logs\cmd-run-injected.log`，两份日志均显示 `attempted=true changed=true codePageAfter=65001`、QR、中文 workspace 路径和 `[remodex] connected`。GitHub Actions 已跑过 M2 commit：`M1 Validation` 三平台矩阵通过（https://github.com/qinhzy/aremodex-bridge-fork/actions/runs/24930678743），仓库现有 `Bridge Check` 也通过（https://github.com/qinhzy/aremodex-bridge-fork/actions/runs/24930678734）。当前 cleanup workflow 新增 Windows console smoke 与 macOS `remodex up -> launchctl list -> remodex stop` smoke，已在 Actions 三平台跑绿；为让 launchd 子进程在 GitHub macOS runner 内不触碰真实 Keychain，LaunchAgent 仅透传既有的设备状态测试 override env，普通用户路径不变。

M2 当前未验证项：尚未在干净 Windows 11 用户上首次运行 loopback/self-host 流程并观察 Defender Firewall 是否弹窗。
