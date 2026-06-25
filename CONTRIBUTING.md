# 贡献 WayCast

早期阶段(Pre-alpha),欢迎先开 issue 讨论方向再动手。

## 开发约定
- 先读 `roadmap.yaml` 与 `CHANGELOG.md` 了解现状与下一步。
- 一个 phase/task 闭环再开下一个;改进度只改 `roadmap.yaml`。
- 重要决策写 `docs/decisions/ADR-NNNN-*.md`。

## 资产授权红线(开源硬约束)
任何**捆绑/再分发**的素材(模型/字体/音乐/图)必须允许**商用 + 再分发**:
- 模型:Apache/MIT 类;音乐:CC0;字体:OFL/Apache。
- 需署名的(CC-BY)**不可捆**,只能用户自带或自动署名。
- 提交前别带任何 key/secret(见 `.gitignore`)。

## 提交
- 分支开发,PR 说明动机 + 关联 roadmap task id。
- 代码风格随仓库;禁止提交大模型权重、成片、`.env`。
