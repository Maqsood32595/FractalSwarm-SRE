const {execSync}=require('child_process');
const o=execSync('gcloud logging read "severity>=ERROR" --project=corded-cable-460921-u1 --freshness=4320h --limit=5 --format=json',{encoding:'utf8',shell:true,maxBuffer:5*1024*1024});
console.log(o.substring(0,800));
