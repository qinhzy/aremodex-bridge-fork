# Progress

## M1: Platform Adapter 抽象与现有行为迁移

打算怎么做：先盘点 phodex-bridge 现有入口、daemon/up/logs/status 相关代码和测试，找出所有平台相关行为的实际边界；然后加入 `src/platform` 抽象骨架，把 macOS 现有 launchd/前台运行/日志/status 行为迁入 `DarwinDaemonManager` 等子接口，把 Linux 现有行为迁入 `LinuxAdapter`，保持 CLI 对外命令和默认路径不变；最后补单元/回归测试，实际运行 M1 四项验收，包括 macOS `up` 零差异验证、Linux 行为验证和 npm test 全绿。若当前机器无法覆盖 macOS 实跑，会把阻塞写清楚并要求真实 macOS 环境补跑，不能把它伪装成已验收。

当前进展：已在 Windows 本机完成 adapter/CLI 迁移和测试可移植性修复，`phodex-bridge` 下 `npm test` 通过 179/179。当前机器没有 WSL、Docker 或 GitHub CLI，无法补 Linux runner；也不是 macOS，无法执行真实 `remodex up` launchd 零差异回归。M1 在提交前仍需要真实 macOS 环境跑 `npm test`、`remodex up`、`remodex status --json`、`remodex reset-pairing` 验收，并需要 Linux runner 跑 `npm test` 与 foreground `up/run` 验收。

结构偏离记录：M1 当前在上游 Remodex 单仓库 fork 中推进，实际工作目录是 `.upstream-remodex/phodex-bridge`，没有先搭 Aremodex monorepo 和 `packages/phodex-bridge/`。这是基于 M1 只改 bridge、当前工作区没有 Android 代码、且需要尽快让 macOS/Linux/Windows CI 验证 adapter 迁移的阶段性判断；它不是对最终仓库结构的永久决策。Beyond M5、开始接入 Android 客户端代码前，必须重新评估是否升级到 monorepo，并确认 bridge fork 与 Aremodex app 的版本号、发布节奏和 CI 边界如何解耦。
