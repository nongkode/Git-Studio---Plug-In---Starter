# Builds a .vsix without npm/vsce.
# Usage: python tools/packgeneric.py <srcdir> <outdir> <comma-separated files>
# Stamps version yy.mdd.hmm (Bangkok time, e.g. 26.1015.1251; no leading zeros) into <srcdir>/package.json,
# writes extension.vsixmanifest + [Content_Types].xml, zips the listed files.
import zipfile,os,json,sys,datetime,re
src,outdir,files=sys.argv[1],sys.argv[2],sys.argv[3].split(',')
outdir=os.path.abspath(outdir)
os.chdir(src)
now=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)+datetime.timedelta(hours=7)
v=f"{int(now.strftime('%y'))}.{int(f'{now.month}{now:%d}')}.{int(f'{now.hour}{now:%M}')}"
txt=open('package.json').read(); txt=re.sub(r'"version": "[^"]*"',f'"version": "{v}"',txt,1); open('package.json','w').write(txt)
pk=json.load(open('package.json'))
deps=','.join(pk.get('extensionDependencies',[]))
manifest=f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="{pk['name']}" Version="{v}" Publisher="{pk['publisher']}" />
    <DisplayName>{pk['displayName']}</DisplayName>
    <Description xml:space="preserve">{pk['description']}</Description>
    <Tags>git</Tags>
    <Categories>{','.join(pk.get('categories',['Other']))}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="{pk['engines']['vscode']}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="{deps}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" />
      <Property Id="Microsoft.VisualStudio.Services.Content.Pricing" Value="Free"/>
    </Properties>
    <License>extension/LICENSE.txt</License>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE.txt" Addressable="true" />
  </Assets>
</PackageManifest>
'''
ct='<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".md" ContentType="text/markdown"/><Default Extension=".txt" ContentType="text/plain"/><Default Extension=".svg" ContentType="image/svg+xml"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>\n'
os.makedirs(outdir,exist_ok=True)
out=f"{outdir}/{pk['name']}-{v}.vsix"
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('extension.vsixmanifest',manifest); z.writestr('[Content_Types].xml',ct)
    for f in files: z.write(f,'extension/'+f)
print(out)
