import {
	Button,
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
	Icons,
	Input,
	useForm,
	Zod,
	zodResolver,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from '@microflow/ui';
import { useEffect } from 'react';
import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator';
import { ShowToast } from '../../../common/types/Message';
import { PageContent, PageHeader } from '../../components/Page';
import { useSetWindowSize } from '../../hooks/useSetWindowSize';
import { sendMessageToFigma } from '../../utils/sendMessageToFigma';
import { useAppStore } from '../../stores/app';
import { mqttUrlSchema } from '@microflow/mqtt-provider/client';

const schema = Zod.object({
	url: mqttUrlSchema,
	username: Zod.string().optional(),
	password: Zod.string().optional(),
	uniqueId: Zod.string()
		.min(5, 'Requires minimum of 5 characters')
		.regex(/^[a-zA-Z_]+$/, { message: 'Only letters and underscores allowed' }),
});

type Schema = Zod.infer<typeof schema>;

const defaultValues: Schema = {
	url: 'test.mosquitto.org',
	uniqueId: '',
};

export function Mqtt() {
	const { mqttConfig, setMqttConfig } = useAppStore();

	const form = useForm<Schema>({
		resolver: zodResolver(schema),
		defaultValues: {
			...defaultValues,
			url: mqttConfig?.url || defaultValues.url,
			username: mqttConfig?.username,
			password: mqttConfig?.password,
			uniqueId: mqttConfig?.uniqueId || '',
		},
	});

	useSetWindowSize({
		width: 400,
		height: 700 + Object.keys(form.formState.errors).length * 28,
	});

	function onSubmit(data: Schema) {
		setMqttConfig(data);
		sendMessageToFigma(ShowToast('Broker settings saved!'));
	}

	function setRandomUniqueName() {
		form.clearErrors('uniqueId');
		form.setValue('uniqueId', uniqueNamesGenerator({ dictionaries: [adjectives, animals] }));
	}

	useEffect(() => {
		if (!mqttConfig) return;
		form.reset({
			...defaultValues,
			url: mqttConfig.url || defaultValues.url,
			username: mqttConfig.username,
			password: mqttConfig.password,
			uniqueId: mqttConfig.uniqueId || '',
		});
	}, [mqttConfig, form.reset]);

	return (
		<>
			<PageHeader title='MQTT settings' />
			<PageContent>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className='my-4 space-y-4'>
						<FormField
							control={form.control}
							name='uniqueId'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Identifier</FormLabel>
									<section className='flex items-center space-x-2'>
										<FormControl>
											<Input placeholder='Your unique identifier' {...field} />
										</FormControl>
										<Button variant='ghost' type='button' onClick={setRandomUniqueName}>
											<Icons.Dices className='w-4 h-4' />
										</Button>
									</section>
									<FormDescription>
										This identifier allows you to send and receive variable values between this
										plugin and other MQTT clients, like{' '}
										<a className='underline' href='https://microflow.vercel.app/' target='_blank'>
											Microflow studio
										</a>
										.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
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
														Defaults: <br />
														protocol=<code>wss</code>, port=<code>8883</code>, path=
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
															<code>ws://mqtt.xiduzo.com:1883</code> →
															ws://mqtt.xiduzo.com:1883/mqtt
														</li>
													</ul>
												</div>
											</TooltipContent>
										</Tooltip>
									</FormLabel>
									<FormControl>
										<Input placeholder='mqtt.xiduzo.com' {...field} />
									</FormControl>
									<FormDescription>
										Format:{' '}
										<code className='text-xs'>
											[&lt;protocol&gt;://]&lt;host&gt;[:&lt;port&gt;][/&lt;path&gt;]
										</code>
										<br />
										<span className='text-xs text-muted-foreground'>
											Defaults: wss://&lt;host&gt;:8883/mqtt
										</span>
									</FormDescription>
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
						<Button type='submit' className='w-full'>
							Save MQTT settings
						</Button>
						<div className='text-blue-500 text-sm'>
							<Icons.Info className='w-3.5 h-3.5 pb-0.5 inline-block mr-1' />
							Make sure to use <code>wss://</code> protocol for encrypted connections.
						</div>
					</form>
				</Form>
			</PageContent>
		</>
	);
}
