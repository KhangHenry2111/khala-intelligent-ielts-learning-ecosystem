# inspect_schema.py - Schema and content inspection for SQL Server DB
import pyodbc

CONN_STR = (
    'Driver={ODBC Driver 17 for SQL Server};'
    'Server=(localdb)\\MSSQLLocalDB;'
    'Database=Ielts;'
    'Trusted_Connection=yes;'
)


def inspect_tables():
    conn = pyodbc.connect(CONN_STR)
    cursor = conn.cursor()
    tables = ['Quiz', 'ReadingPassage', 'QuestionGroup', 'Question', 'KnowledgeDocument', 'UserDocument']
    for t in tables:
        print(f'=== Table: {t} ===')
        for row in cursor.columns(table=t):
            print(f'  {row.column_name}: {row.type_name}({row.column_size}), nullable={row.is_nullable}')
    conn.close()


def inspect_document(document_id: str):
    conn = pyodbc.connect(CONN_STR)
    cursor = conn.cursor()
    query = """
        SELECT
            DocumentID,
            FileName,
            FileURL,
            FileType,
            FileSizeMB,
            LEN(CAST(ExtractedText AS NVARCHAR(MAX))) AS ExtractedLen,
            CAST(ExtractedText AS NVARCHAR(MAX)) AS ExtractedText
        FROM dbo.UserDocument
        WHERE DocumentID = ?;
    """
    row = cursor.execute(query, document_id).fetchone()
    conn.close()

    if row is None:
        print(f'No UserDocument found for DocumentID={document_id}')
        return

    print(f'DocumentID: {row[0]}')
    print(f'FileName: {row[1]}')
    print(f'FileURL: {row[2]}')
    print(f'FileType: {row[3]}')
    print(f'FileSizeMB: {row[4]}')
    print(f'ExtractedLen: {row[5]}')
    print('--- ExtractedText (full) ---')
    print(row[6])


if __name__ == '__main__':
    inspect_tables()
    inspect_document('B296C78E-4647-478B-BFDB-EDE4F340D301')