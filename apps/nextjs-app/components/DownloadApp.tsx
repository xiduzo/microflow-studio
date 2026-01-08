'use client';

import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@microflow/ui';
import { useState } from 'react';

const operationSystems = [
	'MacOS (Apple Silicon)',
	'MacOS (Intel)',
	'Windows',
	'Debian',
	'RedHat',
] as const;
type OperationSystem = (typeof operationSystems)[number];

export function DownloadApp() {
	const [os, setOs] = useState<OperationSystem>();

	function downloadApp() {
		const version = '0.9.1';
		const baseUrl = `https://github.com/xiduzo/microflow/releases/download/v${version}`;

		switch (os) {
			case 'MacOS (Apple Silicon)':
				window.open(`${baseUrl}/Microflow.studio-${version}-arm64.dmg`);
				break;
			case 'MacOS (Intel)':
				window.open(`${baseUrl}/Microflow.studio-${version}-x64.dmg`);
				break;
			case 'Windows':
				window.open(`${baseUrl}/Microflow.studio-${version}.Setup.exe`);
				break;
			case 'Debian':
				window.open(`${baseUrl}/microflow-studio_${version}_amd64.deb`);
				break;
			case 'RedHat':
				window.open(`${baseUrl}/microflow-studio-${version}-1.x86_64.rpm`);
				break;
		}
	}

	return (
		<section className='max-w-lg m-auto mt-6 flex flex-col items-center gap-y-8'>
			<Select onValueChange={value => setOs(value as OperationSystem)}>
				<SelectTrigger>
					<SelectValue placeholder='select your operating system' />
				</SelectTrigger>
				<SelectContent>
					{operationSystems.map(system => (
						<SelectItem key={system} value={system}>
							{system}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button onClick={downloadApp} disabled={!os}>
				Download Microflow studio {os && ` for ${os}`}
			</Button>
		</section>
	);
}
