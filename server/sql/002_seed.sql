-- usuário admin inicial (senha aqui é TEMP; depois a gente ajusta o bcrypt)
INSERT INTO users (name, email, password_hash, role, active)
VALUES ('Admin', 'admin@local', 'TEMP_HASH', 'admin', 1);

INSERT INTO modules (name, slug, "order", status, access, active) VALUES
('Dashboard', 'dashboard', 1, 'Base', 'user+admin', 1),
('Admin', 'admin', 2, 'Base', 'admin', 1);
