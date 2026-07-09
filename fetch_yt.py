import urllib.request
import re

html = urllib.request.urlopen("https://www.youtube.com/watch?v=iJ9wMPUJ7e0").read().decode("utf-8")
match = re.search(r'"shortDescription":"(.*?)"', html)
print("Description:", match.group(1).encode('utf-8').decode('unicode_escape') if match else "Not found")
