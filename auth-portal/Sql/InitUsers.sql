-- Example schema and seed for the AuthService. Run in your SQL Server.
CREATE TABLE Users (
  Id INT IDENTITY(1,1) PRIMARY KEY,
  Username NVARCHAR(100) NOT NULL,
  Password NVARCHAR(256) NOT NULL,
  FullName NVARCHAR(200) NULL,
  Email NVARCHAR(200) NULL,
  UserType NVARCHAR(50) NULL
);

INSERT INTO Users (Username, Password, FullName, Email, UserType) VALUES
('admin', 'admin123', 'Administrator', 'admin@example.com', 'Admin'),
('instructor', 'inst123', 'Instructor One', 'inst@example.com', 'Instructor'),
('student', 'stud123', 'Student One', 'stud@example.com', 'Student');
