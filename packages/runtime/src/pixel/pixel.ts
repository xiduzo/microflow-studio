import { Hardware } from '../base';
import { RGBA } from '../base.types';
import type { Data, Value } from './pixel.types';
import { dataSchema } from './pixel.types';
import pixel from 'node-pixel';
import { transformValueToNumber } from '../_utils/transformUnknownValues';
import { DEFAULT_OFF_PIXEL_COLOR } from './pixel.constants';

export class Pixel extends Hardware<Value, Data, pixel.Strip> {
	private lastFlushTime: number = 0;
	private flushTimeout: NodeJS.Timeout | null = null;
	private readonly FLUSH_INTERVAL_MS = 50;

	constructor(data: Data) {
		super(dataSchema.parse(data), Array(data.length).fill(DEFAULT_OFF_PIXEL_COLOR));
	}

	turnOff() {
		this.flush(Array(this.data.length).fill(DEFAULT_OFF_PIXEL_COLOR));
	}

	show(index: unknown) {
		// Find the preset at the rounded index
		const preset = this.data.presets.at(Math.round(transformValueToNumber(index) - 1));

		if (!preset) return;

		const paddedPreset = Array(this.data.length)
			.fill(DEFAULT_OFF_PIXEL_COLOR)
			.map((_, i) => preset[i] || DEFAULT_OFF_PIXEL_COLOR);

		this.colorPixels(paddedPreset);
	}

	color(color: Value | Value[number] | RGBA) {
		if (!Array.isArray(color)) {
			if (typeof color === 'object') color = `rgb(${color.r}, ${color.g}, ${color.b})`;
			return this.colorStrip(color);
		}
		return this.colorPixels(color);
	}

	move(amount: number = 1) {
		if (amount > 0) this.forward(amount);
		else this.backward(-amount);
	}

	private forward(amount: number = 1) {
		const parsedAmount = transformValueToNumber(amount);
		const normalizedAmount = Math.round(parsedAmount);
		const newValue = this.value.map((_color, index) => {
			const newIndex = (index - normalizedAmount + this.data.length) % this.data.length;
			return this.value[newIndex];
		});
		this.component?.shift(normalizedAmount, pixel.FORWARD, true);
		this.flush(newValue);
	}

	private backward(amount: number = 1) {
		const newValue = this.value.map((_color, index) => {
			const newIndex = (index + amount) % this.data.length;
			return this.value[newIndex];
		});
		this.component?.shift(amount, pixel.BACKWARD, true);
		this.flush(newValue);
	}

	private colorStrip(color: Value[number]) {
		this.component?.color(color);
		this.flush(this.value.map(() => color));
	}

	private colorPixels(colors: Value) {
		colors.forEach((color, index) => {
			this.component?.pixel(index).color(color);
		});
		this.flush(colors);
	}

	private flush(color: Value) {
		const now = Date.now();
		const timeSinceLastFlush = now - this.lastFlushTime;

		if (this.flushTimeout) clearTimeout(this.flushTimeout);
		this.flushTimeout = setTimeout(
			() => {
				if (!this.component) return;
				this.lastFlushTime = Date.now();
				this.value = color;
				this.component?.show();
				this.flushTimeout = null;
			},
			Math.max(5, this.FLUSH_INTERVAL_MS - timeSinceLastFlush)
		);
	}

	createComponent(data: Data): pixel.Strip {
		const component = new pixel.Strip({
			...data,
			strips: [
				{
					pin: data.pin,
					length: data.length,
				},
			],
			color_order: data.color_order as any,
			board: this.data.board as any,
		});
		component.on('ready', () => {
			this.component = component;
			this.turnOff();
			this.emit('ready');
		});
		return component;
	}
}
