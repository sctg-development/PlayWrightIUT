CREATE TABLE events (
	grp TEXT NOT NULL,
	uid TEXT NOT NULL,
	start TEXT NOT NULL,
	end TEXT NOT NULL,
	summary TEXT,
	description TEXT,
	PRIMARY KEY (grp, uid)
);