import os
import glob

routes_dir = 'backend/routes'
for filepath in glob.glob(os.path.join(routes_dir, '*.py')):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Replace url_prefix='/api' with url_prefix=''
    new_content = content.replace("url_prefix='/api'", "url_prefix=''")
    
    with open(filepath, 'w') as f:
        f.write(new_content)

print("Fixed blueprint url_prefixes in all routes.")
