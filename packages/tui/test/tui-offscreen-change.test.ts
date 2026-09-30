import assert from "node:assert";
import { describe, it } from "node:test";
import type { Terminal } from "../src/terminal.ts";
import type { Component } from "../src/tui.ts";
import { type OffscreenChangeContext, TuiMainScreen } from "../src/tui-main-screen.ts";

class RecordingTerminal implements Terminal {
	readonly writes: string[] = [];
	columns = 40;
	rows = 10;
	readonly kittyProtocolActive = false;

	start(_onInput: (data: string) => void, _onResize: () => void): void {}
	stop(): void {}
	async drainInput(_maxMs?: number, _idleMs?: number): Promise<void> {}
	write(data: string): void {
		this.writes.push(data);
	}
	moveBy(_lines: number): void {}
	hideCursor(): void {}
	showCursor(): void {}
	clearLine(): void {}
	clearFromCursor(): void {}
	clearScreen(): void {}
	setTitle(_title: string): void {}
	setProgress(_active: boolean): void {}

	clearWrites(): void {
		this.writes.length = 0;
	}
}

class Lines implements Component {
	lines: string[];

	constructor(lines: string[]) {
		this.lines = lines;
	}

	render(): string[] {
		return this.lines;
	}

	invalidate(): void {}
}

class CountingScreen extends TuiMainScreen {
	offscreenChanges = 0;

	protected override renderOffscreenChange(context: OffscreenChangeContext): void {
		this.offscreenChanges += 1;
		super.renderOffscreenChange(context);
	}
}

class RepaintingScreen extends CountingScreen {
	override renderOffscreenChange(_context: OffscreenChangeContext): void {
		this.offscreenChanges += 1;
	}
}

function countSequence(writes: string[], sequence: string): number {
	return writes.join("").split(sequence).length - 1;
}

function changeLineAboveViewport(screen: TuiMainScreen, terminal: RecordingTerminal): Lines {
	const content = new Lines(Array.from({ length: 30 }, (_, index) => `line ${index}`));
	screen.addChild(content);
	screen.start();
	screen.renderNow();
	terminal.clearWrites();
	content.lines[0] = "line 0 changed";
	screen.renderNow();
	return content;
}

describe("TUI off-screen change", () => {
	it("redraws everything by default when a line above the viewport changed", () => {
		const terminal = new RecordingTerminal();
		const screen = new CountingScreen(terminal);
		try {
			changeLineAboveViewport(screen, terminal);

			assert.strictEqual(screen.offscreenChanges, 1, "the extracted method should be called once");
			assert.strictEqual(countSequence(terminal.writes, "\x1b[3J"), 1, "the default clears the scrollback");
			assert.strictEqual(countSequence(terminal.writes, "\x1b[2J"), 1, "the default clears the screen");
			assert.ok(terminal.writes.join("").includes("line 0 changed"), "the default paints the changed line");
		} finally {
			screen.stop();
		}
	});

	it("lets a subclass repaint instead of clearing", () => {
		const terminal = new RecordingTerminal();
		const screen = new RepaintingScreen(terminal);
		try {
			const content = changeLineAboveViewport(screen, terminal);

			assert.strictEqual(screen.offscreenChanges, 1, "the override should be called once");
			assert.strictEqual(countSequence(terminal.writes, "\x1b[3J"), 0, "an override can keep the scrollback");
			assert.strictEqual(countSequence(terminal.writes, "\x1b[2J"), 0, "an override can keep the screen");

			assert.strictEqual(content.lines[0], "line 0 changed");
			assert.strictEqual(countSequence(terminal.writes, "line 0 changed"), 0, "the override painted nothing");
		} finally {
			screen.stop();
		}
	});
});
