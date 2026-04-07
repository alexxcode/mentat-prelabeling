import subprocess
try:
    out = subprocess.check_output(['gcloud.cmd', 'compute', 'images', 'list', '--project=deeplearning-platform-release', '--no-standard-images', '--format=value(family)', '--sort-by=~creationTimestamp'])
    families = set(out.decode('utf-8').split('\n'))
    print("MATCHES:")
    for f in families:
        if 'cu118' in f or 'cu121' in f or 'pytorch-latest' in f:
            print(f.strip())
except Exception as e:
    print(e)
