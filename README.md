> [!WARNING]  
> This repository is depricated in favor of the [current implementation of Microflow](https://github.com/xiduzo/microflow)

# Microflow

**Create interactive prototypes that connect your designs to real hardware.**

Microflow helps designers and creators build interactive prototypes by connecting digital designs (like those in Figma) to physical microcontrollers (like Arduino boards). No coding required—just drag, drop, and connect.

## What is Microflow?

Microflow is a visual tool that lets you create interactive experiences without writing code. Think of it like connecting building blocks: you drag components onto a canvas, connect them together, and your prototype comes to life.

### Who is it for?

- **Designers** who want to test interactions with real hardware
- **Prototypers** building interactive installations
- **Creators** exploring the intersection of digital and physical design
- **Anyone** who wants to make their designs interactive without learning to code

## What's included?

Microflow consists of two main tools that work together:

### 1. Microflow Studio

A desktop application where you create your interactive prototypes using a visual, flow-based interface. Simply drag and drop components, connect them together, and see your prototype come to life.

**Get started:** Download the latest version from the [releases page](https://github.com/xiduzo/microflow/releases)

### 2. Microflow Hardware Bridge (Figma Plugin)

A Figma plugin that connects your Figma designs to Microflow Studio. This lets you control your physical hardware directly from your Figma prototypes.

**Get started:** Install the [Figma plugin](https://www.figma.com/community/plugin/1373258770799080545) from the Figma Community

## Getting Started

1. **Download Microflow Studio** from the [releases page](https://github.com/xiduzo/microflow/releases)
2. **Install the Figma plugin** from the [Figma Community](https://www.figma.com/community/plugin/1373258770799080545)
3. **Connect your microcontroller** (like an Arduino) to your computer
4. **Start creating!** Check out the [documentation](https://microflow.vercel.app/docs) for tutorials and guides

## Learn More

For detailed guides, tutorials, and examples, visit the [full documentation](https://microflow.vercel.app/docs).

---

## For Developers

_The sections below are for developers who want to contribute to or modify Microflow._

### Running the project locally

This project uses a monorepo structure (all code in one repository) and [Yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces/) to manage dependencies.

#### Microflow Studio

1. Run `yarn install` to install all dependencies
2. Run `yarn dev` to start the development server

**Note about Firmata:** Microflow Studio automatically installs Firmata (communication software) on your microcontroller when you connect it. For [supported boards](https://microflow.vercel.app/docs/microflow-studio#supported-microcontroller-boards), it uses version 2.5.X for TouchDesigner compatibility. All other boards use version 2.4.X.

#### Microflow Hardware Bridge (Figma Plugin)

1. Run `yarn install` to install all dependencies
2. Run `yarn dev:plugin` to start the development server

### Contributing

Want to help improve Microflow? Check out the [wiki](https://github.com/xiduzo/microflow/wiki) to get started contributing.

### Building for macOS

To build the application for macOS, you'll need to follow the [code signing](https://www.electronforge.io/guides/code-signing/code-signing-macos) steps. We use the [import-codesign-certs](https://github.com/Apple-Actions/import-codesign-certs) action for certificate management.
