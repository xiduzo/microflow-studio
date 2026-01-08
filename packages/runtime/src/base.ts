import EventEmitter from 'events';
import JohnnyFive from 'johnny-five';
import { type BaseData, messageSchema } from './base.types';
import pixel from 'node-pixel';

class _BASE<Value, Data extends BaseData> extends EventEmitter {
	private _value: Value;
	private _data: Data;

	public readonly id: string;

	constructor(data: Data, initialValue: Value) {
		super();
		this._value = initialValue;
		this._data = data;
		this.id = data.id ?? '';

		// Make sure we post the message when the value changes even though no one is listening to the event
		super.on('change', () => this.postMessage('change'));
	}

	set data(data: Data) {
		if (JSON.stringify(this._data) === JSON.stringify(data)) return;
		if ('pin' in data && 'pin' in this._data && data.pin !== this._data.pin) {
			throw new PinError(`Can not change pin from ${this._data.pin} to ${data.pin}`);
		}

		if (
			'pins' in data &&
			'pins' in this._data &&
			JSON.stringify(data.pins) !== JSON.stringify(this._data.pins)
		) {
			throw new PinError(
				`Can not change pins from ${JSON.stringify(this._data.pins)} to ${JSON.stringify(data.pins)}`
			);
		}

		this._data = data;
		this.emit('new-data', data);
	}

	get data() {
		return this._data;
	}

	get value() {
		return this._value;
	}

	set value(value: Value) {
		if (JSON.stringify(this._value) === JSON.stringify(value)) return;
		this._value = value;
		this.emit('change', value);
	}

	postMessage(action: string | symbol, edgeId?: string) {
		const message = messageSchema.parse({
			source: this.id,
			sourceHandle: action.toString(),
			value: this.value,
			edgeId,
		});
		if ('parentPort' in process) {
			const parentPort = process.parentPort as { postMessage: (message: unknown) => void };
			parentPort?.postMessage(message);
			return;
		}
		process.send?.(message);
	}

	destroy() {
		super.removeAllListeners();
	}
}

export class Code<Value, Data extends BaseData> extends _BASE<Value, Data> {
	constructor(data: Data, initialValue: Value) {
		super(data, initialValue);
	}
}

type JohnnyFiveComponent =
	| JohnnyFive.Button
	| JohnnyFive.Led
	| JohnnyFive.Led.Matrix
	| JohnnyFive.Led.RGB
	| JohnnyFive.Motion
	| JohnnyFive.Piezo
	| JohnnyFive.Proximity
	| JohnnyFive.Relay
	| JohnnyFive.Sensor
	| JohnnyFive.Servo
	| JohnnyFive.Switch
	| pixel.Strip;

export abstract class Hardware<
	Value,
	Data extends BaseData,
	Component extends JohnnyFiveComponent,
> extends _BASE<Value, Data> {
	protected component: Component;

	constructor(data: BaseData & Data, initialValue: Value) {
		super(data, initialValue);
		this.component = this.createComponent(data);
		this.on('new-data', data => this.createComponent(data));
	}

	protected abstract createComponent(data: BaseData & Data): Component;

	destroy() {
		super.destroy();
		if (this.component instanceof EventEmitter) {
			this.component.removeAllListeners(); // Remove all Firmata listeners
		}
		if (this.component instanceof pixel.Strip) {
			console.log('DESTROYING PIXEL STRIP', this.component);
			this.component.off();
			this.component = null as any;
			// @ts-expect-error - We want to delete the component
			delete this.component;
		}
	}
}

class PinError extends Error {
	constructor(message: string) {
		super(message);
		this.name = this.constructor.name;
	}
}
