# UTDesign EPICS [Next.js](https://nextjs.org) Template Project

This project is the template used for all EPICS CS projects. The core technologies used are:

- [Next.js](https://nextjs.org): A full stack web development framework
- [Prisma](https://prisma.io): A database ORM used to connect Next.js to a database
- [PostgreSQL](https://www.postgresql.org): An open source SQL database

<!-- markdownlint-disable-next-line MD033 -->
<details><summary><h2>Table of Contents</h2></summary>

- [Getting Started](#getting-started)
- [Prerequisites](#prerequisites)
  - [Installing Node](#installing-node)
    - [Node for Windows](#node-for-windows)
    - [Node for Mac/Linux](#node-for-maclinux)
  - [Installing Docker](#installing-docker)
  - [Installing pnpm (recommended/optional)](#installing-pnpm-recommendedoptional)
- [Running This Project](#running-this-project)
- [Learn More](#learn-more)
  - [Learn HTML, CSS, JavaScript, and TypeScript](#learn-html-css-javascript-and-typescript)
    - [HTML](#html)
    - [CSS](#css)
    - [JavaScript](#javascript)
    - [TypeScript](#typescript)
  - [Learn Next.js](#learn-nextjs)
  - [Learn Prisma](#learn-prisma)
- [Deploying This Project](#deploying-this-project)

</details>

## Getting Started

1. The first thing to do is edit this file. The title and description of the project should reflect your project, the organization it is for, and the target functionality.
2. Setup your development environment to ensure you have everything installed to run the project (see the [prerequisites section](#prerequisites)).
3. Run your project (see the [running the project section].(#running-your-project))
4. Start coding!

## Prerequisites

In order to run this project, a few technologies are required:

- [Node.js](https://nodejs.org)
- [Docker](https://www.docker.com)

If you have these installed already, you can skip to [running this project](#running-this-project).

Node.js is what allows us to write all our applications in JavaScript. Usually, JavaScript is run only in a web browser. By building on top of Node.js, we can write code that is executed on the server, simpler to write, and/or more secure.

Docker is a container framework. Containers allow us to standardize the environment that software runs on. In the case of this project, we use Docker to run the PostgreSQL database. By running the database in a container, the database of every person on the team will be configured exactly the same way. Since databases are quite complex applications, this greatly reduces the likelihood of experiencing issues with the database.

### Installing Node

#### Node for Windows

On windows, you can install node from the [Node.js downloads page](https://nodejs.org/en/download). Make sure you install the LTS (long-term support) version! Download and run the installer.

:warning: If shown a check box to install "tools for native modules" make sure you check the box before clicking next :warning:

Once the installation is finished (and you have restarted you computer if prompted), you can continue to [installing Docker](#installing-docker).

#### Node for Mac/Linux

It is recommended to use [node version manager (nvm)](https://github.com/nvm-sh/nvm) to install and run node on Mac/Linux. You can install is by using the command found [here](https://github.com/nvm-sh/nvm#installing-and-updating) in your terminal application. Alternatively, you can follow the installation instructions in the [windows instructions](#node-for-windows).

Once you have installed node version manager installed, run the following commands in your terminal:

```bash
nvm install --lts # Install latest version of Node.js
nvm install-latest-npm # Update npm to latest version
```

These commands do the following:

1. Install the long-term support (LTS) version of Node. The LTS version is the version of Node that will receive security updates the longest.
2. Update the node package manager (npm) to the latest version.

This completes your installation of Node!

### Installing Docker

Docker Desktop is the recommended way to install Docker. If you choose to install Docker another way, there is no guarantee that you will have everything installed correctly. To install docker desktop download and run the installer from [Docker's Getting Started Page](https://www.docker.com/get-started/).

### Installing pnpm (recommended/optional)

pnpm is an improved version of the Node Package Manager (npm). Though not required, it is highly recommended that you install it. You can install it using the following command in your terminal/powershell after node has been installed

```bash
npm install -g pnpm
```

If you choose to install pnpm, then you can substitute all usage of 'npm' with 'pnpm' and all usage of 'npx' with 'pnpx'. Additionally, you can create an alias in your `.bashrc` (Linux) or `.zshrc` (Mac) files. This will mean that when you type in npm or npx, pnpm and pnpx will be substituted. Use the following commands to add the aliases to the corresponding file:

```bash
# Linux
echo 'alias npm="pnpm"' >> .bashrc

# Mac
echo 'alias npm="pnpm"' >> .zshrc
```

## Running This Project

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Python Backend

This project includes a Python backend service built with FastAPI that provides sensor data reading endpoints. The backend receives sensor data (Heat and pH readings) and makes them available to the frontend via REST API.

### Prerequisites for Backend

- [Python](https://www.python.org) (version 3.8 or higher)
- pip (Python package manager)

### Running the Backend

1. Navigate to the `python-backend` directory:

```bash
cd python-backend
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Start the FastAPI server:

```bash
uvicorn app:app --reload --port 8000
```

The backend will be available at [http://localhost:8000](http://localhost:8000).

### Running the Sensor Simulator

In a separate terminal, start the sensor simulator to generate realistic Heat and pH readings:

```bash
cd python-backend
python simulate_readings.py
```

The simulator will send readings every 5 seconds to the backend.

### Backend API Endpoints

- `GET /health` - Health check endpoint
- `GET /api/readings` - Get all stored sensor readings
- `GET /api/readings/latest` - Get the most recent sensor reading
- `POST /api/readings` - Submit a new sensor reading

### Reading Data from a Raspberry Pi

To connect real sensor data from a Raspberry Pi:

1. **Install sensor libraries** on your Pi:

```bash
pip install adafruit-circuitpython-dht
pip install board
```

2. **Create a sensor reader script** (e.g., `pi_sensor_reader.py`):

```python
import asyncio
import aiohttp
import board
import adafruit_dht

# Initialize DHT sensor (adjust pin if needed)
dht = adafruit_dht.DHT22(board.D4)
BACKEND_URL = "http://your-backend-ip:8000"

async def read_and_send_sensors(session):
    try:
        temperature = dht.temperature
        humidity = dht.humidity

        # Send temperature as heat
        heat_data = {"type": "heat", "value": temperature, "unit": "°C"}
        await session.post(f"{BACKEND_URL}/api/readings", json=heat_data)

        # Send humidity as pH (or replace with actual pH sensor)
        ph_data = {"type": "ph", "value": humidity, "unit": ""}
        await session.post(f"{BACKEND_URL}/api/readings", json=ph_data)

        print(f"Temperature: {temperature}°C, Humidity: {humidity}%")
    except Exception as e:
        print(f"Error reading sensors: {e}")

async def main():
    async with aiohttp.ClientSession() as session:
        while True:
            await read_and_send_sensors(session)
            await asyncio.sleep(5)  # Read every 5 seconds

if __name__ == "__main__":
    asyncio.run(main())
```

3. **Update the backend URL** to point to your backend server (either localhost for development or your server's IP for remote deployment).

4. **Run on the Pi**:

```bash
python pi_sensor_reader.py
```

The real sensor data will now flow to your backend and be displayed on your frontend dashboard in real-time.

## Learn More

### Learn HTML, CSS, JavaScript, and TypeScript

#### HTML

Websites are built using HTML, CSS, and JavaScript. HTML, or Hypertext Markup Language, is a markup language for the web that defines the structure of web pages[^1]. Examples of these structures include paragraphs, headings, headers, footers, lists, navigation, and images. Each one of these components is defined in an HTML file for every website you visit.

[^1]: [What is HTML - Definition and Meaning of Hypertext Markup Language by freeCodeCamp](https://www.freecodecamp.org/news/what-is-html-definition-and-meaning/)

#### CSS

#### JavaScript

#### TypeScript

### Learn Next.js

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Official Next.js Examples](https://github.com/vercel/next.js/tree/canary/examples)
- [Official Next.js with Prisma Example](https://github.com/prisma/prisma-examples/tree/latest/typescript/rest-nextjs-api-routes)

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

### Learn Prisma

To learn more about Prisma, take a look at the following resources:

- [Prisma Documentation](https://www.prisma.io/docs)
- [Learn Prisma](https://www.prisma.io/learn)
- [Official Prisma Examples](https://github.com/prisma/prisma-examples)

## Deploying This Project
