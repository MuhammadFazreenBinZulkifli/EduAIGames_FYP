# Database Configuration

## PostgreSQL Setup Guide

### Windows Installation

1. Download PostgreSQL from https://www.postgresql.org/download/windows/
2. Run the installer
3. Remember the password you set for the `postgres` user
4. During installation, select port 5432 (default)
5. After installation, PostgreSQL should be running as a service

### Create the Database

**Option 1: Using pgAdmin (GUI)**
1. Open pgAdmin (installed with PostgreSQL)
2. Right-click on "Databases" → Create → Database
3. Enter database name: `registration_db`
4. Click Save

**Option 2: Using Command Line**
1. Open Command Prompt or PowerShell
2. Connect to PostgreSQL:
   ```
   psql -U postgres
   ```
3. Create the database:
   ```sql
   CREATE DATABASE registration_db;
   ```
4. Verify:
   ```sql
   \l
   ```
   You should see `registration_db` in the list

### Verify Connection

The server will automatically create the `users` table when it starts. To verify the connection works:

1. Start the server: `npm run dev` in the server directory
2. You should see: `Database initialized successfully`
3. Server is running on `http://localhost:5000`

### Check Data

To view registered users in PostgreSQL:

```sql
psql -U postgres -d registration_db

-- Inside psql:
SELECT * FROM users;
```

## Troubleshooting

**Error: "FATAL: Ident authentication failed"**
- Use: `psql -U postgres` (with sudo on Linux)

**Error: "could not connect to server"**
- PostgreSQL service is not running
- Windows: Start from Services (services.msc)
- Linux: `sudo service postgresql start`

**Error: "database registration_db does not exist"**
- Create it using the steps above

## Reset Database

To delete all users and reset:

```sql
DROP TABLE users;
```

The server will recreate it automatically on next start.
