const test = require('node:test');
const assert = require('node:assert/strict');

process.env.AIRTABLE_TOKEN = 'test-token';
process.env.AIRTABLE_BASE_ID = 'appLvJsO1Q8w5lLnP';
process.env.AIRTABLE_APPLICATIONS_TABLE = 'Executive Applications';
process.env.AIRTABLE_ORGANIZATIONS_TABLE = 'Organizations';

const { handler } = require('./airtable');

function form(overrides = {}) {
  const values = {
    full_name:'Test Executive',email_address:'executive@example.com',title_position:'Managing Director',
    organization_company:'Example Capital',country_jurisdiction:'United States',
    stakeholder_category:'Institutional Investor',primary_area_of_interest:'Investment & Capital Markets',
    interest:['Strategic Sessions','Investment Opportunities'],applicant_persona:'Institutional Investor',
    deployable_capital_range:'$25M-$100M',session_jurisdiction:'Grenada',
    code_of_conduct_accepted:'yes',code_of_conduct_version:'2026-09-16.1',confirmation:'yes',
    form_started_at:String(Date.now()-5000),...overrides
  };
  const body = new URLSearchParams();
  for (const [key,value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) body.append(key === 'interest' ? 'interest[]' : key,item);
  }
  return {httpMethod:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:body.toString()};
}

function jsonResponse(body,status=200) {
  return {ok:status>=200&&status<300,status,json:async()=>body};
}

test('creates a v4.5 application with normalized migration fields', async () => {
  let created;
  global.fetch = async (url,options={}) => {
    if (options.method === 'POST') {
      created = JSON.parse(options.body).records[0].fields;
      return jsonResponse({records:[{id:'recCreated'}]});
    }
    return jsonResponse({records:[]});
  };
  const result = await handler(form());
  assert.equal(result.statusCode,302);
  assert.equal(created['Applicant Persona'],'Institutional Investor');
  assert.equal(created['Deployable Capital Range'],'$25M-$100M');
  assert.equal(created['Investment Capacity'],'Institutional Investor');
  assert.equal(created['Data Quality Status'],'Unreviewed');
  assert.equal(created['Email Verification Status'],'Not Verified');
  assert.match(created['Submission Request ID'],/^[0-9a-f-]{36}$/);
});

test('blocks a recent duplicate email before creating a record', async () => {
  let posts = 0;
  global.fetch = async (url,options={}) => {
    if (options.method === 'POST') { posts++; return jsonResponse({records:[]}); }
    if (String(url).includes('Executive%20Applications')) return jsonResponse({records:[{id:'recDuplicate'}]});
    return jsonResponse({records:[]});
  };
  const result = await handler(form());
  assert.equal(result.statusCode,429);
  assert.equal(posts,0);
});

test('accepts the prior form during the transition and dual-writes its persona', async () => {
  let created;
  global.fetch = async (url,options={}) => {
    if (options.method === 'POST') {
      created = JSON.parse(options.body).records[0].fields;
      return jsonResponse({records:[{id:'recLegacy'}]});
    }
    return jsonResponse({records:[]});
  };
  const result = await handler(form({
    applicant_persona:'',deployable_capital_range:'',investment_capacity:'Advisor / Consultant',
    code_of_conduct_version:'2026-09-08.1',form_started_at:''
  }));
  assert.equal(result.statusCode,302);
  assert.equal(created['Applicant Persona'],'Advisor / Consultant');
  assert.equal(created['Investment Capacity'],'Advisor / Consultant');
  assert.equal(created['Code of Conduct Version'],'2026-09-08.1');
  assert.equal(created['Data Quality Status'],'Needs Review');
});

test('rejects invented select values', async () => {
  global.fetch = async () => { throw new Error('fetch should not be called'); };
  const result = await handler(form({stakeholder_category:'Invented Category'}));
  assert.equal(result.statusCode,400);
});

test('silently diverts honeypot submissions', async () => {
  global.fetch = async () => { throw new Error('fetch should not be called'); };
  const result = await handler(form({company_fax:'555-0100'}));
  assert.equal(result.statusCode,302);
});
