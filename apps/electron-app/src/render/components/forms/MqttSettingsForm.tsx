import {
	Button,
	Field,
	FieldDescription,
	FieldLabel,
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
	Input,
	useForm,
	Zod,
	zodResolver,
	toast,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
	Icons,
} from '@microflow/ui';
import { useAppStore } from '../../stores/app';
import { mqttUrlSchema } from '@microflow/mqtt-provider/client';

const schema = Zod.object({
	url: mqttUrlSchema,
	username: Zod.string().optional(),
	password: Zod.string().optional(),
});

type Schema = Zod.infer<typeof schema>;

export function MqttSettingsForm() {
	const { user, mqttConfig, setMqttConfig, setSettingsOpen } = useAppStore();

	const form = useForm({
		resolver: zodResolver(schema),
		mode: 'onChange',
		reValidateMode: 'onChange',
		defaultValues: {
			url: mqttConfig?.url || 'test.mosquitto.org',
			username: mqttConfig?.username,
			password: mqttConfig?.password as string,
		},
	});

	function onSubmit(data: Schema) {
		setMqttConfig(data);
		form.reset(data);
		toast.success('MQTT settings saved', {
			description: 'Your MQTT broker settings have been updated successfully.',
		});
	}

	return (
		<div className='space-y-4'>
			<p className='text-sm text-muted-foreground'>
				When using Figma nodes, make sure to configure the same MQTT broker in the{' '}
				<a
					className='underline'
					href='https://www.figma.com/community/plugin/1373258770799080545/figma-hardware-bridge'
					target='_blank'
				>
					Figma plugin
				</a>
				.
			</p>
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
					<Field>
						<FieldLabel htmlFor='checkout-7j9-card-name-43j'>Identifier</FieldLabel>
						<Input id='checkout-7j9-card-name-43j' value={user?.name} disabled />
						<FieldDescription>This is configured in your user settings</FieldDescription>
					</Field>
					<FormField
						control={form.control}
						name='url'
						render={({ field }) => (
							<FormItem>
								<FormLabel className='flex items-center justify-between'>
									Broker URL
									<Tooltip>
										<TooltipTrigger>
											<Icons.CircleQuestionMark size={16} />
										</TooltipTrigger>
										<TooltipContent className='max-w-xs'>
											<div className='space-y-2'>
												<p className='font-semibold'>Format:</p>
												<code className='text-xs'>
													[&lt;protocol&gt;://]&lt;host&gt;[:&lt;port&gt;][/&lt;path&gt;]
												</code>
												<p className='text-xs text-muted-foreground'>
													Defaults:
													<br /> protocol=<code>wss</code>, port=<code>8883</code>, path=
													<code>/mqtt</code>
												</p>
												<p className='font-semibold mt-3'>Examples:</p>
												<ul className='text-xs space-y-1 list-disc list-inside'>
													<li>
														<code>mqtt.xiduzo.com</code> → wss://mqtt.xiduzo.com:8883/mqtt
													</li>
													<li>
														<code>mqtt.xiduzo.com:443</code> → wss://mqtt.xiduzo.com:443/mqtt
													</li>
													<li>
														<code>mqtt.xiduzo.com/mqtt</code> → wss://mqtt.xiduzo.com:8883/mqtt
													</li>
													<li>
														<code>mqtt.xiduzo.com:443/mqtt</code> → wss://mqtt.xiduzo.com:443/mqtt
													</li>
													<li>
														<code>wss://mqtt.xiduzo.com:8884</code> →
														wss://mqtt.xiduzo.com:8884/mqtt
													</li>
													<li>
														<code>wss://mqtt.xiduzo.com:443/mqtt</code> →
														wss://mqtt.xiduzo.com:443/mqtt
													</li>
													<li>
														<code>ws://mqtt.xiduzo.com:1883</code> → ws://mqtt.xiduzo.com:1883/mqtt
													</li>
												</ul>
											</div>
										</TooltipContent>
									</Tooltip>
								</FormLabel>
								<FormControl>
									<Input placeholder='mqtt.xiduzo.com' {...field} />
								</FormControl>
								<FieldDescription>
									<code className='text-xs'>
										[&lt;protocol&gt;://]&lt;host&gt;[:&lt;port&gt;][/&lt;path&gt;]
									</code>
									<br />
									<span className='text-xs text-muted-foreground'>
										Defaults: wss://&lt;host&gt;:8883/mqtt
									</span>
								</FieldDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name='username'
						render={({ field }) => (
							<FormItem>
								<FormLabel>Username</FormLabel>
								<FormControl>
									<Input placeholder='xiduzo' {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name='password'
						render={({ field }) => (
							<FormItem>
								<FormLabel>Password</FormLabel>
								<FormControl>
									<Input placeholder='************' type='password' {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<div className='flex justify-end gap-2 pt-2'>
						<Button type='submit' disabled={!form.formState.dirtyFields || !form.formState.isValid}>
							Save changes
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
}
