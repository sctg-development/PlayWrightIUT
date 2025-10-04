CREATE TABLE events (
	grp TEXT NOT NULL,
	uid TEXT PRIMARY KEY,
	start TEXT NOT NULL,
	end TEXT NOT NULL,
	summary TEXT,
	description TEXT
);