import openpyxl
import json

try:
    wb = openpyxl.load_workbook('prueba2.xlsx')
    sheet = wb.active
    
    headers = [cell.value for cell in sheet[1]]
    
    row_data = []
    if sheet.max_row >= 2:
        row_data = [cell.value for cell in sheet[2]]
        
    print("HEADERS:")
    print(json.dumps(headers, indent=2))
    
    print("\nSAMPLE ROW:")
    sample = dict(zip(headers, row_data))
    # Convert datetime objects to string for json serialization
    for k, v in sample.items():
        if hasattr(v, 'isoformat'):
            sample[k] = v.isoformat()
            
    print(json.dumps(sample, indent=2))
    
except Exception as e:
    print(f"Error: {e}")
