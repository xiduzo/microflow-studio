import { create } from 'zustand';
import mqtt, { IClientPublishOptions, OnMessageCallback } from 'mqtt';
import { z } from 'zod';

const clients = ['app', 'plugin'] as const;
export type Client = (typeof clients)[number];

const ConnectionStatuses = ['connected', 'disconnected', 'connecting'] as const;
export type ConnectionStatus = (typeof ConnectionStatuses)[number];

/**
 * Regex pattern to validate MQTT URL format
 * Format: [<protocol>://]<host>[:<port>][/<path>]
 * Protocol defaults to wss, port defaults to 8883, path defaults to /mqtt
 */
export const mqttUrlRegex = /^(?:(ws|wss):\/\/)?([^\s\/:]+)(?::(\d+))?(?:\/(.*))?$/;

/**
 * Zod schema for validating MQTT URL format
 * Format: [<protocol>://]<host>[:<port>][/<path>]
 * - Protocol is optional (defaults to wss)
 * - Host is required
 * - Port is optional (defaults to 8883)
 * - Path is optional (defaults to /mqtt)
 *
 * Examples:
 * - mqtt.xiduzo.com → wss://mqtt.xiduzo.com:8883/mqtt
 * - mqtt.xiduzo.com:443 → wss://mqtt.xiduzo.com:443/mqtt
 * - mqtt.xiduzo.com/mqtt → wss://mqtt.xiduzo.com:8883/mqtt
 * - mqtt.xiduzo.com:443/mqtt → wss://mqtt.xiduzo.com:443/mqtt
 * - wss://mqtt.xiduzo.com:443/mqtt → wss://mqtt.xiduzo.com:443/mqtt
 */
export const mqttUrlSchema = z
	.string()
	.min(1, 'Host is required')
	.superRefine((input, ctx) => {
		console.log('[MQTT URL Validation] Parsing full URL:', input);
		// Check if it's a full URL (starts with ws:// or wss://)
		if (input.startsWith('ws://') || input.startsWith('wss://')) {
			try {
				const urlObj = new URL(input);
				const protocol = urlObj.protocol.replace(':', '') as 'ws' | 'wss';

				if (protocol !== 'ws' && protocol !== 'wss') {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `Invalid protocol: ${protocol}. Must be 'ws' or 'wss'`,
					});
					return;
				}

				const host = urlObj.hostname;
				if (!host || host.length === 0) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Host is required',
					});
					return;
				}

				// Validate port if provided
				if (urlObj.port) {
					const port = parseInt(urlObj.port, 10);
					if (isNaN(port) || port < 1 || port > 65535) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: `Invalid port: ${urlObj.port}. Must be between 1 and 65535`,
						});
						return;
					}
				}
			} catch (error) {
				console.error('[MQTT URL Validation] Error parsing URL:', input, error);
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Invalid URL format. Expected: [ws://|wss://]<host>[:<port>][/<path>]. Error: ${error instanceof Error ? error.message : 'Unable to parse URL'}`,
				});
			}
		} else {
			// It's a host with optional port and path - validate format
			// Format: host[:port][/path]
			if (/\s/.test(input)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Host cannot contain spaces',
				});
				return;
			}

			// Parse host:port/path manually
			// Host cannot contain colons or slashes
			const portMatch = input.match(/^([^:/]+)(?::(\d+))?(?:\/(.*))?$/);
			if (!portMatch) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Invalid hostname format',
				});
				return;
			}

			const host = portMatch[1];
			const portStr = portMatch[2];

			// Validate host
			if (!host || host.length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Host is required',
				});
				return;
			}

			// Check for basic hostname validity (contains at least one dot or is localhost)
			if (host !== 'localhost' && !host.includes('.')) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Invalid hostname format',
				});
				return;
			}

			// Validate port if provided
			if (portStr) {
				const port = parseInt(portStr, 10);
				if (isNaN(port) || port < 1 || port > 65535) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `Invalid port: ${portStr}. Must be between 1 and 65535`,
					});
					return;
				}
			}
		}
	});

export type MqttConfig = {
	url: string; // Format: [<protocol>://]<host>[:<port>][/<path>] - protocol defaults to wss, port defaults to 8883, path defaults to /mqtt
	username?: string;
	password?: string;
	uniqueId: string;
};

type Subscription = {
	callback: OnMessageCallback;
	options?: mqtt.IClientSubscribeOptions | mqtt.IClientSubscribeProperties;
};

type MqttStore = {
	// Connection state
	status: ConnectionStatus;
	appName: Client;
	uniqueId: string;
	connectedClients: Array<{ appName: Client; status: ConnectionStatus }>;

	// Actions
	connect: (config: MqttConfig, appName: Client) => void;
	subscribe: (
		topic: string,
		callback: OnMessageCallback,
		options?: mqtt.IClientSubscribeOptions | mqtt.IClientSubscribeProperties
	) => () => void;
	publish: (topic: string, payload: string, options?: IClientPublishOptions) => void;
};

export const useMqttStore = create<MqttStore>((set, get) => {
	// Internal state (not exposed)
	let client: mqtt.MqttClient | undefined;
	let config: MqttConfig | null = null;
	let subscriptions = new Map<string, Subscription>();
	let connectedClients = new Map<Client, ConnectionStatus>();

	const disconnect = () => {
		client?.removeAllListeners();
		client?.end(true);
		client = undefined;
	};

	const unsubscribe = (topic: string) => {
		subscriptions.delete(topic);
		if (client?.connected) {
			console.debug('[MQTT] <unsubscribe>', topic);
			client.unsubscribeAsync(topic).catch(console.error);
		}
	};

	const subscribe = (
		topic: string,
		callback: OnMessageCallback,
		options?: mqtt.IClientSubscribeOptions | mqtt.IClientSubscribeProperties
	) => {
		subscriptions.set(topic, { callback, options });

		// Only subscribe if client is connected
		if (client?.connected) {
			console.debug('[MQTT] <subscribe>', client?.connected, topic, options);
			client.subscribeAsync(topic, options);
		}

		return () => {
			unsubscribe(topic);
		};
	};

	const publish = (topic: string, payload: string, options?: IClientPublishOptions) => {
		// Only publish if client is connected
		if (!client?.connected) {
			console.warn('[MQTT] <publish> Client not connected', topic);
			return;
		}

		console.debug('[MQTT] <publish>', topic, payload, options);
		client.publishAsync(topic, payload, options).catch(error => {
			console.error('[MQTT] <publish>', error);
		});
	};

	const resubscribe = async () => {
		const { appName, uniqueId } = get();
		if (!config || !appName || !uniqueId || !client?.connected) {
			return;
		}

		const statusTopic = `microflow/v1/${uniqueId}/+/status`;

		for (const [topic, { callback, options }] of Array.from(subscriptions)) {
			if (topic === statusTopic) continue;

			client.subscribeAsync(topic, options).catch(error => {
				console.error('[MQTT] <resubscribe error>', topic, error);
			});
		}
	};

	const escapeRegExp = (str: string) => {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	};

	const handleMessage = (topic: string, payload: Buffer, packet: any) => {
		Array.from(subscriptions.keys()).forEach(subscription => {
			const regexp = escapeRegExp(subscription).replace(/\\\+/g, '\\S+').replace(/\\#/, '\\S+');
			if (!topic.match(regexp)) return;

			try {
				const { callback } = subscriptions.get(subscription)!;
				callback?.(topic, payload, packet);
			} catch {
				console.error('Error in callback for topic', {
					topic,
					subscription,
				});
			}
		});
	};

	/**
	 * Parses an MQTT URL string into connection options
	 * Format: [<protocol>://]<host>[:<port>][/<path>]
	 *
	 * Defaults:
	 * - Protocol: wss
	 * - Port: 8883
	 * - Path: /mqtt
	 *
	 * Examples:
	 * - mqtt.xiduzo.com → wss://mqtt.xiduzo.com:8883/mqtt
	 * - mqtt.xiduzo.com:443 → wss://mqtt.xiduzo.com:443/mqtt
	 * - mqtt.xiduzo.com/mqtt → wss://mqtt.xiduzo.com:8883/mqtt
	 * - mqtt.xiduzo.com:443/mqtt → wss://mqtt.xiduzo.com:443/mqtt
	 * - wss://mqtt.xiduzo.com:443/mqtt → wss://mqtt.xiduzo.com:443/mqtt
	 *
	 * Note: This function assumes the input has already been validated by mqttUrlSchema
	 */
	const parseMqttUrl = (
		input: string
	): {
		protocol: 'ws' | 'wss';
		host: string;
		port: number;
		path: string;
	} => {
		try {
			const validatedInput = mqttUrlSchema.parse(input);
			const match = validatedInput.match(mqttUrlRegex);
			if (!match || !match[2]) {
				throw new Error(`Invalid MQTT URL format: ${input}. Could not parse host.`);
			}
			const [, protocol, host, port, path] = match;

			return {
				protocol: (protocol ?? 'wss') as 'ws' | 'wss',
				host,
				port: port ? parseInt(String(port), 10) : (protocol ?? 'wss') === 'wss' ? 8883 : 1883,
				path: path ?? '/mqtt',
			};
		} catch (error) {
			throw new Error(
				`Invalid MQTT URL format: ${input}. Expected format: [<protocol>://]<host>[:<port>][/<path>]`
			);
		}
	};

	const connect = async (configParam: MqttConfig, appName: Client) => {
		config = configParam; // Update internal variables
		if (client) {
			disconnect();
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		set({ status: 'connecting', appName, uniqueId: config.uniqueId });

		// Parse the URL string into connection components
		const { protocol, host, port, path } = parseMqttUrl(config.url);
		const clientId = `microflow_${appName}_${config.uniqueId}_${Date.now().toString(36)}`;

		// Construct the full URL for WebSocket connections
		// mqtt.js requires the URL as the first argument for proper clientId handling
		const url = `${protocol}://${host}:${port}${path}`;

		console.debug('[MQTT] <connect> Parsed URL:', {
			input: config.url,
			protocol,
			host,
			port,
			path,
			constructedUrl: url,
			clientId,
		});

		// Build connection options (without protocol/host/port/path when using URL)
		const connectionOptions: mqtt.IClientOptions = {
			username: config.username,
			password: config.password,
			clientId,
			// connectTimeout: 30000, // 30 seconds
			// keepalive: 60, // 60 seconds
			// clean: true, // Start with a clean session
			// reconnectPeriod: 1000, // Reconnect after 1 second
			// For WSS connections, ensure proper SSL handling
			...(protocol === 'wss'
				? {
						// Allow self-signed certificates (common for public brokers)
						rejectUnauthorized: false,
					}
				: {}),
			will: {
				topic: `microflow/v1/${config.uniqueId}/${appName}/status`,
				retain: true,
				qos: 2,
				properties: {
					willDelayInterval: 0,
				},
				payload: new Uint8Array([
					100, 105, 115, 99, 111, 110, 110, 101, 99, 116, 101, 100,
				]) as Buffer,
			},
		};

		console.debug('[MQTT] <connect>', config, appName, url, connectionOptions);
		client = mqtt.connect(url, connectionOptions);

		// Handle status messages from other clients
		const statusHandler = (topic: string, payload: Buffer) => {
			const from = topic.split('/')[3].toString();
			if (from === appName) return; // No need to get status from self

			connectedClients.set(from as Client, payload.toString() as 'connected' | 'disconnected');
			set({
				connectedClients: Array.from(connectedClients.entries()).map(([appName, status]) => ({
					appName,
					status,
				})),
			});
		};

		client
			.on('connect', async () => {
				console.debug('[MQTT] <connect>', config?.uniqueId);
				await resubscribe();
				subscribe(`microflow/v1/${config.uniqueId}/+/status`, statusHandler);
				publish(`microflow/v1/${config.uniqueId}/${appName}/status`, 'connected', {
					retain: true,
					qos: 2,
				});
				set({ status: 'connected' });
			})
			.on('reconnect', () => {
				console.debug('[MQTT] <reconnect>');
				set({ status: 'connecting' });
			})
			.on('error', error => {
				console.debug('[MQTT] <error>', error);
				set({ status: 'disconnected' });
			})
			.on('offline', () => {
				console.debug('[MQTT] <offline>');
				set({ status: 'disconnected' });
			})
			.on('disconnect', error => {
				console.debug('[MQTT] <disconnect>', error);
				set({ status: 'disconnected' });
			})
			.on('close', () => {
				console.debug('[MQTT] <close>');
				set({ status: 'disconnected' });
			})
			.on('end', () => {
				console.debug('[MQTT] <end>');
				set({ status: 'disconnected' });
			})
			.on('message', handleMessage);
	};

	return {
		// Initial state
		status: 'disconnected',
		appName: 'app',
		uniqueId: '',
		connectedClients: [],
		// Actions
		connect,
		subscribe,
		publish,
	};
});
