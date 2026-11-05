import {
    BlockInputEvents,
    Color,
    Component,
    EditBox,
    EventTouch,
    Graphics,
    HorizontalTextAlignment,
    ImageAsset,
    Label,
    Layers,
    Mask,
    Node,
    ResolutionPolicy,
    ScrollView,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    Vec3,
    VerticalTextAlignment,
    Widget,
    _decorator,
    dynamicAtlasManager,
    view,
} from 'cc';

const { ccclass, executeInEditMode } = _decorator;

type Tone = 'pink' | 'yellow' | 'blue' | 'green' | 'purple';
type Phase = 'playing' | 'won' | 'out';
type Step = 'reveal' | 'clue';
type Screen = 'home' | 'game';

interface Tile {
    id: number;
    value: number;
    color: Tone;
    dots: 1 | 2 | 3;
}

interface Point {
    x: number;
    y: number;
}

const COLORS: Tone[] = ['pink', 'yellow', 'blue', 'green', 'purple'];
const COLOR_NAME: Record<Tone, string> = {
    pink: '粉',
    yellow: '黄',
    blue: '蓝',
    green: '绿',
    purple: '紫',
};

const BG = hex('#15151D');
const CARD = hex('#24232E');
const TRAY = hex('#3A2F28');
const TRAY_INNER = hex('#2A221C');
const PINK = hex('#F54E8D');
const YELLOW = hex('#FFD45B');
const BLUE = hex('#69B7FF');
const GREEN = hex('#7ED6A5');
const PURPLE = hex('#A78BFA');
const INK = hex('#F8F7F2');
const DARK_INK = hex('#15151D');
const MUTED = hex('#B8B2C9');
const DIM = hex('#9B95AD');
const SOFT = hex('#918B9B');
const PANEL = hex('#2A2935');
const SELECTED = hex('#3A2937');
const BOARD = hex('#F3EFE4');
const INK_PEN = hex('#2C241B');

function hex(value: string): Color {
    const n = parseInt(value.slice(1), 16);
    return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, 255);
}

function toneColor(tone: Tone): Color {
    if (tone === 'pink') return PINK;
    if (tone === 'yellow') return YELLOW;
    if (tone === 'blue') return BLUE;
    if (tone === 'green') return GREEN;
    return PURPLE;
}

function shuffle<T>(list: T[]): T[] {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

function createAllTiles(): Tile[] {
    const tiles: Tile[] = [];
    for (let value = 1; value <= 60; value += 1) {
        tiles.push({
            id: value,
            value,
            color: COLORS[(value - 1) % 5],
            dots: (((value - 1) % 3) + 1) as 1 | 2 | 3,
        });
    }
    return tiles;
}

function sortNotch(hand: Tile[], value: number): number {
    let i = 0;
    while (i < hand.length && hand[i].value < value) i += 1;
    return i;
}

@ccclass('PartyApp')
@executeInEditMode
export class PartyApp extends Component {
    private screen: Screen = 'home';
    private phase: Phase = 'playing';
    private step: Step = 'reveal';
    private supply: Tile[] = [];
    private publicPool: Tile[] = [];
    private hand: Tile[] = [];
    private eliminated = new Set<number>();
    private selectedPublicId = 0;
    private compareSlot = -1;
    private guessOpen = false;
    private guessUsed = false;
    private feedback = '';
    private lastSort = -1;
    private log: string[] = [];
    private turn = 1;
    private strokes: Point[][] = [];
    private drawing = false;

    private white: SpriteFrame | null = null;
    private roundFrame: SpriteFrame | null = null;
    private homeRoot: Node | null = null;
    private gameRoot: Node | null = null;
    private modalRoot: Node | null = null;
    private contentRoot: Node | null = null;
    private drawRoot: Node | null = null;
    private drawGraphics: Graphics | null = null;
    private guessEdits: EditBox[] = [];

    onEnable(): void {
        dynamicAtlasManager.enabled = false;
        view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_HEIGHT);
        const widget = this.getComponent(Widget);
        if (widget) widget.enabled = false;
        const canvas = this.getComponent(UITransform);
        if (canvas) canvas.setContentSize(750, 1334);
        this.scheduleOnce(() => {
            const previous = this.node.getChildByName('AppRoot');
            if (previous) {
                previous.removeFromParent();
                previous.destroy();
            }
            this.build();
        }, 0);
    }

    private build(): void {
        this.resetGame();
        const root = this.child(this.node, 'AppRoot', 750, 1334);
        root.setPosition(0, 0);
        this.paint(root, 750, 1334, BG, 0);
        this.homeRoot = this.buildHome(root);
        this.gameRoot = this.buildGame(root);
        this.modalRoot = this.buildGuessModal(root);
        this.render();
        this.applyLayer(root);
    }

    private resetGame(): void {
        const all = shuffle(createAllTiles());
        const byColor: Record<Tone, Tile[]> = {
            pink: [],
            yellow: [],
            blue: [],
            green: [],
            purple: [],
        };
        all.forEach((tile) => byColor[tile.color].push(tile));

        this.hand = COLORS.map((color) => byColor[color].pop()!);
        this.hand.sort((a, b) => a.value - b.value);

        this.publicPool = COLORS.map((color) => byColor[color].pop()!);
        this.supply = shuffle(COLORS.flatMap((color) => byColor[color]));
        this.eliminated = new Set<number>();
        this.publicPool.forEach((tile) => this.eliminated.add(tile.value));
        this.phase = 'playing';
        this.step = 'reveal';
        this.selectedPublicId = this.publicPool[0]?.id || 0;
        this.compareSlot = -1;
        this.guessOpen = false;
        this.guessUsed = false;
        this.feedback = '点牌盘里背面朝上的小牌，翻开一张公共牌';
        this.lastSort = -1;
        this.turn = 1;
        this.log = ['本地练习：点翻牌盘里的牌，系统当邻座答线索'];
        this.strokes = [];
        this.drawing = false;
        this.redrawBoard();
    }

    private buildHome(parent: Node): Node {
        const page = this.child(parent, 'Home', 750, 1334);
        let y = 560;
        this.text(page, 'GOT FIVE · TABLE PRACTICE', 18, MUTED, 0, y, 640, 28);
        y -= 78;
        this.text(page, '五猜缤纷', 64, INK, 0, y, 640, 78, true);
        y -= 78;
        this.text(page, '牌盘里翻牌，推理板上涂涂画画，尽量接近实体桌游手感。', 26, MUTED, -10, y, 560, 90).horizontalAlign =
            HorizontalTextAlignment.LEFT;
        this.circle(page, 250, 520, 46, PINK);
        this.circle(page, 300, 460, 20, YELLOW);

        y -= 140;
        const info = this.child(page, 'Today', 670, 190);
        info.setPosition(0, y);
        this.paint(info, 670, 190, CARD, 28);
        this.text(info, '练习模式', 22, DIM, 0, 52, 600, 30);
        this.text(info, '实体桌面感', 48, YELLOW, 0, -2, 600, 70, true);
        this.text(info, '点翻牌盘 · 手绘记录板', 22, DIM, 0, -58, 600, 30);

        y -= 160;
        this.button(page, '开始练习  →', 670, 92, 0, y, PINK, INK, () => this.enterGame());

        y -= 130;
        this.text(page, '怎么玩', 28, INK, -250, y, 160, 40, true).horizontalAlign = HorizontalTextAlignment.LEFT;
        const rules: Array<[Color, string]> = [
            [PINK, '中央牌盘是打乱的背面牌，点哪张翻哪张'],
            [YELLOW, '翻开后问邻座：排序位置或比较圆点'],
            [BLUE, '下方白板可手绘记录，随时宣布五数'],
        ];
        rules.forEach((rule, index) => {
            const row = y - 56 - index * 48;
            this.circle(page, -292, row, 7, rule[0]);
            this.text(page, rule[1], 24, MUTED, 20, row, 520, 36).horizontalAlign = HorizontalTextAlignment.LEFT;
        });
        return page;
    }

    private buildGame(parent: Node): Node {
        const page = this.child(parent, 'Game', 750, 1334);

        const viewNode = this.child(page, 'View', 750, 900);
        viewNode.setPosition(0, 217);
        viewNode.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        const content = this.child(viewNode, 'Content', 750, 1800);
        const contentUi = content.getComponent(UITransform)!;
        contentUi.setAnchorPoint(0.5, 1);
        content.setPosition(0, 450);
        this.contentRoot = content;
        const scroll = viewNode.addComponent(ScrollView);
        scroll.vertical = true;
        scroll.horizontal = false;
        scroll.content = content;
        scroll.cancelInnerEvents = false;

        this.drawRoot = this.buildDrawBoard(page);
        return page;
    }

    private buildDrawBoard(parent: Node): Node {
        const board = this.child(parent, 'DrawBoard', 720, 390);
        board.setPosition(0, -470);
        this.paint(board, 720, 390, CARD, 20);

        this.text(board, '私人推理板 · 手指涂画记录', 20, MUTED, -80, 160, 420, 30).horizontalAlign =
            HorizontalTextAlignment.LEFT;

        this.button(board, '撤销', 110, 48, 170, 160, PANEL, INK, () => this.undoStroke());
        this.button(board, '清空', 110, 48, 290, 160, PANEL, INK, () => this.clearStrokes());

        const paper = this.child(board, 'Paper', 680, 280);
        paper.setPosition(0, -20);
        this.paint(paper, 680, 280, BOARD, 12);

        // 淡色数字网格参考（不可点）
        for (let n = 1; n <= 60; n += 1) {
            const col = (n - 1) % 10;
            const row = Math.floor((n - 1) / 10);
            this.text(paper, String(n), 14, hex('#D6CFC0'), -300 + col * 66, 110 - row * 40, 40, 24);
        }

        const inkNode = this.child(paper, 'Ink', 680, 280);
        const graphics = inkNode.addComponent(Graphics);
        graphics.lineWidth = 4;
        graphics.strokeColor = INK_PEN;
        graphics.lineJoin = Graphics.LineJoin.ROUND;
        graphics.lineCap = Graphics.LineCap.ROUND;
        this.drawGraphics = graphics;

        paper.on(Node.EventType.TOUCH_START, this.onDrawStart, this);
        paper.on(Node.EventType.TOUCH_MOVE, this.onDrawMove, this);
        paper.on(Node.EventType.TOUCH_END, this.onDrawEnd, this);
        paper.on(Node.EventType.TOUCH_CANCEL, this.onDrawEnd, this);

        return board;
    }

    private buildGuessModal(parent: Node): Node {
        const modal = this.child(parent, 'GuessModal', 750, 1334);
        modal.addComponent(BlockInputEvents);
        this.paint(modal, 750, 1334, new Color(0, 0, 0, 170), 0);
        const panel = this.child(modal, 'Panel', 640, 520);
        this.paint(panel, 640, 520, CARD, 28);
        this.text(panel, 'Got Five!', 40, YELLOW, 0, 200, 560, 50, true);
        this.text(panel, '按从小到大输入你的五张牌', 22, MUTED, 0, 150, 560, 30);
        this.guessEdits = [];
        for (let i = 0; i < 5; i += 1) {
            const box = this.child(panel, `Guess${i}`, 100, 72);
            box.setPosition(-220 + i * 110, 40);
            this.paint(box, 100, 72, PANEL, 14);
            this.guessEdits.push(this.editBox(box, 88, 60, `${i + 1}`, 2));
        }
        this.button(panel, '取消', 230, 76, -135, -160, PANEL, INK, () => {
            this.guessOpen = false;
            this.render();
        });
        this.button(panel, '宣布', 230, 76, 135, -160, PINK, INK, () => this.submitGuess());
        modal.active = false;
        return modal;
    }

    private enterGame(): void {
        this.resetGame();
        this.screen = 'game';
        this.render();
    }

    private flipSupplyTile(id: number): void {
        if (this.phase !== 'playing' || this.step !== 'reveal') return;
        const index = this.supply.findIndex((tile) => tile.id === id);
        if (index < 0) return;
        const [tile] = this.supply.splice(index, 1);
        this.publicPool.push(tile);
        this.eliminated.add(tile.value);
        this.selectedPublicId = tile.id;
        this.step = 'clue';
        this.compareSlot = -1;
        this.lastSort = -1;
        this.feedback = `翻开 ${COLOR_NAME[tile.color]}色 ${tile.value}（${tile.dots} 点）。点一张公共牌，再问线索`;
        this.log = [`第 ${this.turn} 回合翻开 ${tile.value}`, ...this.log].slice(0, 6);
        this.render();
    }

    private selectPublic(id: number): void {
        if (this.phase !== 'playing' || this.step !== 'clue') return;
        this.selectedPublicId = id;
        this.compareSlot = -1;
        this.lastSort = -1;
        this.feedback = '已选公共牌。选「排序」或先点自己的隐藏牌再「比较圆点」';
        this.render();
    }

    private askSort(): void {
        if (this.phase !== 'playing' || this.step !== 'clue') return;
        const tile = this.publicPool.find((item) => item.id === this.selectedPublicId);
        if (!tile) return;
        const notch = sortNotch(this.hand, tile.value);
        this.lastSort = notch;
        this.feedback = `邻座排序：落在你的第 ${notch + 1} 个空位（共 6 个）`;
        this.log = [`排序 ${tile.value} → 空位 ${notch + 1}`, ...this.log].slice(0, 6);
        this.endTurn();
    }

    private pickCompareSlot(slot: number): void {
        if (this.phase !== 'playing' || this.step !== 'clue') return;
        this.compareSlot = slot;
        this.feedback = `已选中你的第 ${slot + 1} 张隐藏牌，可点「比较圆点」`;
        this.render();
    }

    private askCompare(): void {
        if (this.phase !== 'playing' || this.step !== 'clue') return;
        const tile = this.publicPool.find((item) => item.id === this.selectedPublicId);
        if (!tile) return;
        if (this.compareSlot < 0) {
            this.feedback = '先点选你的一张隐藏牌';
            this.render();
            return;
        }
        const same = this.hand[this.compareSlot].dots === tile.dots;
        this.feedback = same ? '邻座回答：圆点相同' : '邻座回答：圆点不同';
        this.log = [`比较 ${tile.value} vs 第 ${this.compareSlot + 1} 张 → ${same ? '相同' : '不同'}`, ...this.log].slice(0, 6);
        this.endTurn();
    }

    private endTurn(): void {
        this.step = 'reveal';
        this.compareSlot = -1;
        this.turn += 1;
        this.feedback = `${this.feedback}。下一回合再到牌盘里点翻一张`;
        this.render();
    }

    private openGuess(): void {
        if (this.phase !== 'playing' || this.guessUsed) return;
        this.guessOpen = true;
        this.guessEdits.forEach((edit) => {
            edit.string = '';
        });
        this.render();
    }

    private submitGuess(): void {
        if (this.phase !== 'playing' || this.guessUsed) return;
        const values = this.guessEdits.map((edit) => Number(String(edit.string || '').trim()));
        if (values.some((n) => !Number.isInteger(n) || n < 1 || n > 60)) {
            this.feedback = '请输入 5 个 1–60 的整数';
            this.render();
            return;
        }
        for (let i = 1; i < values.length; i += 1) {
            if (values[i] <= values[i - 1]) {
                this.feedback = '必须按从小到大宣布';
                this.render();
                return;
            }
        }
        this.guessUsed = true;
        this.guessOpen = false;
        const correct = values.every((value, index) => value === this.hand[index].value);
        if (correct) {
            this.phase = 'won';
            this.feedback = 'Got Five！五张牌全部正确';
            this.log = ['宣布正确，练习胜利', ...this.log].slice(0, 6);
        } else {
            this.phase = 'out';
            this.feedback = `宣布错误。正确是 ${this.hand.map((tile) => tile.value).join(' · ')}`;
            this.log = ['宣布错误，出局', ...this.log].slice(0, 6);
        }
        this.render();
    }

    private localPoint(event: EventTouch, node: Node): Point {
        const ui = node.getComponent(UITransform)!;
        const loc = event.getUILocation();
        const p = ui.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
        return { x: p.x, y: p.y };
    }

    private onDrawStart(event: EventTouch): void {
        if (this.screen !== 'game' || this.guessOpen) return;
        event.propagationStopped = true;
        const paper = event.currentTarget as Node;
        this.drawing = true;
        this.strokes.push([this.localPoint(event, paper)]);
        this.redrawBoard();
    }

    private onDrawMove(event: EventTouch): void {
        if (!this.drawing || !this.strokes.length) return;
        event.propagationStopped = true;
        const paper = event.currentTarget as Node;
        this.strokes[this.strokes.length - 1].push(this.localPoint(event, paper));
        this.redrawBoard();
    }

    private onDrawEnd(event: EventTouch): void {
        if (!this.drawing) return;
        event.propagationStopped = true;
        this.drawing = false;
        const last = this.strokes[this.strokes.length - 1];
        if (last && last.length < 2) this.strokes.pop();
        this.redrawBoard();
    }

    private undoStroke(): void {
        this.strokes.pop();
        this.redrawBoard();
    }

    private clearStrokes(): void {
        this.strokes = [];
        this.redrawBoard();
    }

    private redrawBoard(): void {
        const g = this.drawGraphics;
        if (!g) return;
        g.clear();
        g.lineWidth = 4;
        g.strokeColor = INK_PEN;
        this.strokes.forEach((stroke) => {
            if (stroke.length < 2) return;
            g.moveTo(stroke[0].x, stroke[0].y);
            for (let i = 1; i < stroke.length; i += 1) g.lineTo(stroke[i].x, stroke[i].y);
            g.stroke();
        });
    }

    private render(): void {
        if (!this.homeRoot || !this.gameRoot || !this.contentRoot) return;
        this.homeRoot.active = this.screen === 'home';
        this.gameRoot.active = this.screen === 'game';
        if (this.drawRoot) this.drawRoot.active = this.screen === 'game';
        if (this.modalRoot) this.modalRoot.active = this.screen === 'game' && this.guessOpen;
        if (this.screen !== 'game') return;

        const content = this.contentRoot;
        content.removeAllChildren();
        let y = -16;

        this.text(content, `练习桌 · 第 ${this.turn} 回合`, 18, MUTED, -170, y - 18, 360, 28).horizontalAlign =
            HorizontalTextAlignment.LEFT;
        this.text(
            content,
            this.phase === 'won' ? '胜利' : this.phase === 'out' ? '出局' : this.step === 'reveal' ? '翻牌' : '问线索',
            28,
            this.phase === 'won' ? GREEN : this.phase === 'out' ? PINK : YELLOW,
            230,
            y - 18,
            180,
            36,
            true,
        );
        y -= 64;

        // 隐藏手牌架
        const handCard = this.child(content, 'HandCard', 700, 168);
        handCard.setPosition(0, y - 84);
        this.paint(handCard, 700, 168, CARD, 20);
        this.text(handCard, '你的牌架（背面朝自己，看不到数字）', 18, MUTED, 0, 58, 640, 28);
        this.hand.forEach((tile, index) => {
            const slot = this.child(handCard, `H${index}`, 108, 100);
            slot.setPosition(-240 + index * 120, -16);
            this.paint(slot, 108, 100, this.compareSlot === index ? SELECTED : toneColor(tile.color), 14);
            this.text(slot, COLOR_NAME[tile.color], 20, DARK_INK, 0, 18, 90, 26, true);
            this.text(slot, this.phase === 'playing' ? '?' : String(tile.value), 30, DARK_INK, 0, -18, 90, 34, true);
            if (this.phase === 'playing' && this.step === 'clue') {
                slot.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                    event.propagationStopped = true;
                    this.pickCompareSlot(index);
                });
            }
        });
        y -= 188;

        // 公共明牌区
        const sortedPublic = this.publicPool.slice().sort((a, b) => a.value - b.value);
        const pubRows = Math.max(1, Math.ceil(sortedPublic.length / 6));
        const pubH = 108 + pubRows * 78;
        const pub = this.child(content, 'Public', 700, pubH);
        pub.setPosition(0, y - pubH / 2);
        this.paint(pub, 700, pubH, CARD, 20);
        this.text(pub, `已翻开的公共牌 · ${sortedPublic.length}`, 18, MUTED, 0, pubH / 2 - 28, 640, 28);
        sortedPublic.forEach((tile, index) => {
            const col = index % 6;
            const row = Math.floor(index / 6);
            const slot = this.child(pub, `P${tile.id}`, 96, 70);
            slot.setPosition(-250 + col * 100, pubH / 2 - 78 - row * 78);
            this.paint(slot, 96, 70, tile.id === this.selectedPublicId ? SELECTED : PANEL, 12);
            this.circle(slot, -30, 16, 8, toneColor(tile.color));
            this.text(slot, String(tile.value), 24, INK, 8, 10, 50, 28, true);
            this.text(slot, '•'.repeat(tile.dots), 16, YELLOW, 0, -18, 80, 22);
            if (this.phase === 'playing' && this.step === 'clue') {
                slot.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                    event.propagationStopped = true;
                    this.selectPublic(tile.id);
                });
            }
        });
        y -= pubH + 18;

        // 中央牌盘：背面朝上
        if (this.phase === 'playing' && this.step === 'reveal') {
            const cols = 8;
            const rows = Math.ceil(this.supply.length / cols) || 1;
            const trayH = 110 + rows * 58;
            const tray = this.child(content, 'Tray', 700, trayH);
            tray.setPosition(0, y - trayH / 2);
            this.paint(tray, 700, trayH, TRAY, 24);
            const inner = this.child(tray, 'Inner', 660, trayH - 48);
            inner.setPosition(0, -8);
            this.paint(inner, 660, trayH - 48, TRAY_INNER, 18);
            this.text(tray, `牌盘 · 背面朝上 · 剩余 ${this.supply.length} 张（点一张翻开）`, 18, hex('#E8DCC8'), 0, trayH / 2 - 24, 640, 28);

            this.supply.forEach((tile, index) => {
                const col = index % cols;
                const row = Math.floor(index / cols);
                const jitterX = ((tile.id * 17) % 7) - 3;
                const jitterY = ((tile.id * 13) % 5) - 2;
                const slot = this.child(inner, `S${tile.id}`, 68, 48);
                slot.setPosition(-280 + col * 80 + jitterX, (trayH - 48) / 2 - 36 - row * 56 + jitterY);
                // 背面只露颜色倾向，不露数字
                const back = toneColor(tile.color).clone();
                back.a = 220;
                this.paint(slot, 68, 48, back, 10);
                this.paint(this.child(slot, 'Edge', 60, 40), 60, 40, hex('#1A1512'), 8);
                this.circle(slot, 0, 0, 8, hex('#F8F7F2'));
                slot.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                    event.propagationStopped = true;
                    this.flipSupplyTile(tile.id);
                });
            });
            y -= trayH + 18;
        }

        if (this.phase === 'playing' && this.step === 'clue') {
            const clue = this.child(content, 'Clue', 700, 150);
            clue.setPosition(0, y - 75);
            this.paint(clue, 700, 150, CARD, 20);
            this.text(clue, '向邻座（系统）问线索', 18, MUTED, 0, 45, 640, 28);
            this.button(clue, '排序位置', 300, 68, -160, -18, YELLOW, DARK_INK, () => this.askSort());
            this.button(clue, '比较圆点', 300, 68, 160, -18, BLUE, DARK_INK, () => this.askCompare());
            y -= 168;
        }

        const feed = this.child(content, 'Feed', 700, 88);
        feed.setPosition(0, y - 44);
        this.paint(feed, 700, 88, PANEL, 16);
        this.text(feed, this.feedback || ' ', 20, YELLOW, 0, 0, 640, 64);
        y -= 108;

        if (this.phase === 'playing' && !this.guessUsed) {
            this.button(content, 'Got Five! 宣布五数', 700, 78, 0, y - 39, PINK, INK, () => this.openGuess());
            y -= 100;
        }

        if (this.phase !== 'playing') {
            this.button(content, '再练一局', 700, 78, 0, y - 39, YELLOW, DARK_INK, () => {
                this.resetGame();
                this.render();
            });
            y -= 100;
            this.button(content, '返回首页', 700, 68, 0, y - 34, PANEL, INK, () => {
                this.screen = 'home';
                this.render();
            });
            y -= 90;
        }

        this.text(content, '线索记录', 18, MUTED, -250, y, 160, 28).horizontalAlign = HorizontalTextAlignment.LEFT;
        y -= 34;
        this.log.forEach((line) => {
            this.text(content, line, 20, SOFT, 0, y, 640, 28).horizontalAlign = HorizontalTextAlignment.LEFT;
            y -= 32;
        });
        y -= 24;

        content.getComponent(UITransform)!.setContentSize(750, Math.max(900, Math.abs(y) + 80));
        this.redrawBoard();
    }

    private child(parent: Node, name: string, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = this.node.layer || Layers.Enum.UI_2D;
        parent.addChild(node);
        const ui = node.addComponent(UITransform);
        ui.setContentSize(width, height);
        ui.setAnchorPoint(0.5, 0.5);
        return node;
    }

    private paint(node: Node, width: number, height: number, fill: Color, _radius: number): void {
        const ui = node.getComponent(UITransform)!;
        const sprite = node.getComponent(Sprite) || node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.frame(false);
        sprite.color = fill;
        ui.setContentSize(width, height);
    }

    private circle(parent: Node, x: number, y: number, radius: number, fill: Color): Node {
        const node = this.child(parent, 'Dot', radius * 2, radius * 2);
        node.setPosition(x, y);
        const ui = node.getComponent(UITransform)!;
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.frame(true);
        sprite.color = fill;
        ui.setContentSize(radius * 2, radius * 2);
        return node;
    }

    private frame(round: boolean): SpriteFrame {
        if (round && this.roundFrame) return this.roundFrame;
        if (!round && this.white) return this.white;
        const size = round ? 64 : 8;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (context) {
            context.clearRect(0, 0, size, size);
            context.fillStyle = '#ffffff';
            if (round) {
                context.beginPath();
                context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                context.fill();
            } else {
                context.fillRect(0, 0, size, size);
            }
        }
        const image = new ImageAsset(canvas);
        const texture = new Texture2D();
        texture.image = image;
        const frame = new SpriteFrame();
        frame.texture = texture;
        frame.packable = false;
        if (round) this.roundFrame = frame;
        else this.white = frame;
        return frame;
    }

    private text(
        parent: Node,
        value: string,
        size: number,
        color: Color,
        x: number,
        y: number,
        width: number,
        height: number,
        bold = false,
    ): Label {
        const node = this.child(parent, 'Label', width, height);
        node.setPosition(x, y);
        const label = node.addComponent(Label);
        label.useSystemFont = true;
        label.fontFamily = 'PingFang SC';
        label.string = value;
        label.fontSize = size;
        label.lineHeight = size + 8;
        label.color = color;
        label.isBold = bold;
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private button(
        parent: Node,
        title: string,
        width: number,
        height: number,
        x: number,
        y: number,
        fill: Color,
        ink: Color,
        onClick: () => void,
    ): Node {
        const node = this.child(parent, title, width, height);
        node.setPosition(x, y);
        this.paint(node, width, height, fill, 18);
        this.text(node, title, Math.min(26, height / 2.6), ink, 0, 0, width - 20, height, true);
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            onClick();
        });
        return node;
    }

    private editBox(parent: Node, width: number, height: number, placeholder: string, maxLength: number): EditBox {
        const node = this.child(parent, 'Edit', width, height);
        const text = this.text(node, '', 26, INK, 0, 0, width - 12, height);
        text.horizontalAlign = HorizontalTextAlignment.CENTER;
        const hint = this.text(node, placeholder, 20, DIM, 0, 0, width - 12, height);
        hint.horizontalAlign = HorizontalTextAlignment.CENTER;
        const edit = node.addComponent(EditBox);
        edit.textLabel = text;
        edit.placeholderLabel = hint;
        edit.placeholder = placeholder;
        edit.inputMode = EditBox.InputMode.NUMERIC;
        edit.maxLength = maxLength;
        edit.string = '';
        this.scheduleOnce(() => {
            node.children.forEach((child) => {
                if (child.isValid && child !== text.node && child !== hint.node && (child.name === 'TEXT_LABEL' || child.name === 'PLACEHOLDER_LABEL')) {
                    child.destroy();
                }
            });
        }, 0);
        return edit;
    }

    private applyLayer(node: Node): void {
        node.layer = this.node.layer || Layers.Enum.UI_2D;
        node.children.forEach((child) => this.applyLayer(child));
    }
}
