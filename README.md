# 五猜缤纷 · Cocos 原型

基于桌游 [Got Five / 五猜缤纷](https://bgacn.com/games/got_five) 的 **Cocos Creator 3.8.8** 本地单人练习原型。

## 当前范围

- 中央牌盘：背面朝上的打乱小牌，点击翻开
- 问线索：排序位置 / 比较圆点（系统扮演邻座）
- 私人推理板：手绘笔迹记录（可撤销 / 清空）
- Got Five：宣布五数，对赢错出局

尚未做：真实 2–4 人联机、微信小游戏导出。

## 协作分工（建议）

| 角色 | 负责 |
| --- | --- |
| 你（本仓发起） | 原型构建、交互手感、推理板绘画体验 |
| 协作者 | 后续规则完善、联机 / 内容 / 工程化等（另议） |

## 本地运行

1. 安装 Cocos Creator **3.8.8**
2. 用 Dashboard / 编辑器打开本仓库
3. 打开 `assets/scenes/Home.scene`，点播放

主逻辑：`assets/scripts/PartyApp.ts`

## 提交约定

- 不要提交 `library/`、`temp/`、`profiles/`、`build/`（已在 `.gitignore`）
- 改交互前先拉最新；大改 UI / 笔迹系统时尽量单独分支
