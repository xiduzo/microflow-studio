export function transformValueToBoolean(value: unknown) {
	switch (typeof value) {
		case 'boolean':
			return value;
		case 'number':
			return value > 0;
		case 'string':
			const isTruthy = ['1', 'true', 'on', 'yes'].includes(String(value).toLowerCase());
			const isSecretlyPositiveNumber = !Number.isNaN(Number(value)) && Number(value) > 0;
			return isTruthy || isSecretlyPositiveNumber;
		default:
			return false;
	}
}

export function transformValueToNumber(value: unknown) {
	switch (typeof value) {
		case 'number':
			return value;
		case 'boolean':
			return value ? 1 : 0;
		case 'string':
			const parsed = parseFloat(value);
			if (Number.isNaN(parsed)) return transformValueToBoolean(value) ? 1 : 0;
			return parsed;
		default:
			return 0;
	}
}
