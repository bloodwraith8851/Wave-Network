# 🌊 Wave Network — Advanced Discord Ticket Bot

Wave Network is an advanced ticket management bot for Discord servers, designed to enhance support and communication. With full **slash command** support, **customizable settings**, **beautiful embeds**, and **transcript generation**, Wave Network offers a premium ticketing experience.

---

## 🚀 Features

- 🎫 **Advanced Ticket System** — Create, manage, and close tickets effortlessly.
- ⚙️ **Customizable Settings** — Tailor the bot’s ticket categories, admin roles, and more.
- 🧵 **Slash Command Support** — Fully integrated with Discord’s slash commands for smooth interaction.
- 💬 **Beautiful Embeds** — Stunning embeds designed for a premium user experience.
- 🛡️ **Anti-Crash System** — Automatically ensures bot stability.
- 🔁 **Keep-Alive Service** — Keep your bot running with minimal downtime (supports platforms like Replit).
- 📄 **Transcript Generation** — Export ticket conversations as HTML for easy record-keeping.
- 🖱️ **Buttons & Menus Support** — Interactive UI elements for managing tickets with ease.

---

## 📦 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/rakeshsarkar9711/Wave-Network.git
cd Wave-Network
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure the Bot

- Rename `.env.example` to `.env`
- Fill in the required environment variables:

```env
TOKEN=your-bot-token
PREFIX=!
CLIENT_ID=your-client-id
USER_SECRET_ID=your-secret-id
```

- Open `storage/config.js` and customize it:

```js
module.exports = {
  server_support: "https://discord.gg/your-invite",
  server_id: "YOUR_DISCORD_SERVER_ID",
  vip_role: ["VIP_ROLE_ID_1", "VIP_ROLE_ID_2"],
  owner: ["OWNER_ID_1", "OWNER_ID_2"]
}
```

---

## 💻 Usage

### 🎟️ Ticket Commands

- `/ticket create` — Create a new ticket
- `/ticket close` — Close an existing ticket
- `/ticket setup` — Setup the ticket system in a channel

### 👑 Owner Commands

- `/post` — Post messages or embeds to a channel or DM
- `/server list` — List all servers the bot is in
- `/server leave` — Leave a server

### ℹ️ Info Commands

- `/help` — Show help information
- `/ping` — Check bot's latency
- `/invite` — Get the bot's invite link

---

## ⚙️ Configuration

### 🔐 Environment Variables

| Variable        | Description                          |
|----------------|--------------------------------------|
| `TOKEN`         | Bot token from the Discord Developer Portal |
| `PREFIX`        | Prefix for message-based commands    |
| `CLIENT_ID`     | Discord Client ID                    |
| `USER_SECRET_ID`| Discord Client Secret                |

### 🧾 Config File (`storage/config.js`)

| Field           | Description                              |
|----------------|------------------------------------------|
| `server_support`| Invite link to your support server       |
| `server_id`     | Your Discord server's ID                 |
| `vip_role`      | List of VIP role IDs                     |
| `owner`         | Array of bot owner Discord user IDs      |

---

## 🤝 Contributing

We welcome contributions from everyone! Please follow the guidelines in the [CONTRIBUTING.md](CONTRIBUTING.md) file when submitting a pull request.

---

## 📄 License

This project is licensed under the **BSD 3-Clause License**.  
See the [LICENSE](LICENSE) file for more details.

---

## 🛠️ Support

Need help or want to chat?  
- Join our [Discord Support Server](https://discord.gg/zeWbHEgNhB)  
- Or open an issue on [GitHub Issues](https://github.com/rakeshsarkar9711/Wave-Network/issues)

---

## 👥 Contributors

- **rakeshsarkar9711** | [GitHub](https://github.com/rakeshsarkar9711)

---

## 🌟 Sponsor Wave Network

If you like this project, consider sponsoring it! Your contributions will help the development team continue working on it and add new features.  
[![Sponsor on GitHub](https://img.shields.io/github/sponsors/rakeshsarkar9711)](https://github.com/sponsors/rakeshsarkar9711)
