"""
IELTS Database Connection Test - SQLAlchemy
Tests connection and queries all users from the database
"""

import configparser
import sys
from datetime import datetime
try:
    from sqlalchemy import create_engine, text, Column, String, DateTime, Float
    from sqlalchemy.orm import sessionmaker, declarative_base
    from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
except ImportError:
    create_engine = None
    text = None
    Column = String = DateTime = Float = UNIQUEIDENTIFIER = None
    sessionmaker = declarative_base = None

# Configuration
CONFIG_FILE = "config.cfg"

# Define User model
if declarative_base is not None:
    Base = declarative_base()

    class User(Base):
        __tablename__ = 'User'

        UserID = Column(UNIQUEIDENTIFIER, primary_key=True)
        FullName = Column(String(255), nullable=False)
        Username = Column(String(100), nullable=False, unique=True)
        Password = Column(String(255), nullable=False)
        Email = Column(String(255), nullable=False, unique=True)
        PhoneNumber = Column(String(20))
        Avatar = Column(String(500))
        Role = Column(String(20), default='USER')
        Status = Column(String(20), default='Active')
        EmailVerified = Column(String(1), default='0')
        CurrentBand = Column(Float)
        TargetBand = Column(Float)
        LearningLevel = Column(String(20))
        CreatedAt = Column(DateTime)
        UpdatedAt = Column(DateTime)
        LastLogin = Column(DateTime)

        def __repr__(self):
            return f"<User(UserID='{self.UserID}', Username='{self.Username}', Email='{self.Email}')>"


def read_connection_string(config_file):
    """Read connection string from config.cfg"""
    config = configparser.ConfigParser()
    
    if not config.read(config_file):
        raise FileNotFoundError(f"Config file not found: {config_file}")
    
    if 'sqlserver' not in config:
        raise ValueError("Section 'sqlserver' not found in config file")
    
    connection_string = config.get('sqlserver', 'connection_string')
    
    if not connection_string:
        raise ValueError("connection_string not found in config file")
    
    return connection_string


def convert_ado_to_sqlalchemy(ado_connection_string):
    """
    Convert ADO.NET connection string to SQLAlchemy connection URL
    ADO format: Data Source=...;Initial Catalog=...;Integrated Security=True;...
    SQLAlchemy format: mssql+pyodbc:///?odbc_connect=...
    """
    # Parse the ADO connection string
    params = {}
    for param in ado_connection_string.split(';'):
        param = param.strip()
        if '=' in param:
            key, value = param.split('=', 1)
            params[key.strip()] = value.strip()
    
    # Build SQLAlchemy connection string
    driver = "ODBC Driver 17 for SQL Server"  # or "SQL Server" for older systems
    server = params.get('Data Source', 'localhost')
    database = params.get('Initial Catalog', 'IELTS')
    integrated_security = params.get('Integrated Security', 'False').lower() == 'true'
    
    if integrated_security:
        # Use Windows authentication
        connection_url = f"mssql+pyodbc://@{server}/{database}?driver={driver}&Trusted_Connection=yes"
    else:
        # Use SQL authentication
        user = params.get('User Id', '')
        password = params.get('Password', '')
        connection_url = f"mssql+pyodbc://{user}:{password}@{server}/{database}?driver={driver}"
    
    return connection_url


def test_connection(engine):
    """Test database connection"""
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT DB_NAME() as DatabaseName, @@VERSION as ServerVersion"))
            row = result.fetchone()
            print("✓ Connection successful!")
            print(f"  Database: {row[0]}")
            print(f"  Server Version: {row[1][:80]}...")  # Truncate version string
            return True
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        return False


def query_all_users(session):
    """Query and display all users"""
    try:
        users = session.query(User).order_by(User.CreatedAt.desc()).all()
        
        if not users:
            print("No users found in database.")
            return
        
        print(f"\nFound {len(users)} user(s):\n")
        print(f"{'FullName':<20} {'Username':<20} {'Email':<35} {'Role':<10} {'Status':<10} {'Created':<19}")
        print("-" * 115)
        
        for user in users:
            created = user.CreatedAt.strftime("%Y-%m-%d %H:%M:%S") if user.CreatedAt else "N/A"
            print(f"{str(user.FullName):<20} {str(user.Username):<20} {str(user.Email):<35} {str(user.Role):<10} {str(user.Status):<10} {created:<19}")
        
        return len(users)
    except Exception as e:
        print(f"✗ Error querying users: {e}")
        return 0


def get_user_statistics(session):
    """Get user statistics"""
    try:
        total = session.query(User).count()
        active = session.query(User).filter(User.Status == 'Active').count()
        inactive = session.query(User).filter(User.Status == 'Inactive').count()
        banned = session.query(User).filter(User.Status == 'Banned').count()
        
        print(f"\nUser Statistics:")
        print(f"  Total Users: {total}")
        print(f"  Active: {active}")
        print(f"  Inactive: {inactive}")
        print(f"  Banned: {banned}")
    except Exception as e:
        print(f"✗ Error getting statistics: {e}")


def main():
    print("=" * 60)
    print("IELTS Database Connection Test - SQLAlchemy")
    print("=" * 60)
    print()
    
    try:
        # Read configuration
        print(f"Reading configuration from {CONFIG_FILE}...")
        ado_connection_string = read_connection_string(CONFIG_FILE)
        print(f"✓ Configuration loaded\n")
        
        # Convert to SQLAlchemy URL
        print("Converting ADO.NET connection string to SQLAlchemy format...")
        sqlalchemy_url = convert_ado_to_sqlalchemy(ado_connection_string)
        print(f"✓ Conversion successful\n")
        
        # Create engine
        print("Creating database engine...")
        engine = create_engine(sqlalchemy_url, echo=False)
        print("✓ Engine created\n")
        
        # Test connection
        print("Testing database connection...")
        if not test_connection(engine):
            sys.exit(1)
        
        # Create session
        Session = sessionmaker(bind=engine)
        session = Session()
        
        # Query users
        print("\n" + "=" * 60)
        print("Querying Users")
        print("=" * 60)
        query_all_users(session)
        
        # Get statistics
        print("\n" + "=" * 60)
        get_user_statistics(session)
        
        # Close session
        session.close()
        
        print("\n" + "=" * 60)
        print("✓ Test completed successfully!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
