-- SYNTHETIC DEMO DATA for local development only. Every person, company and job here is fictional.
-- Demo login: demo@benchflow.local / demo-password-123 (owner), viewer@benchflow.local / demo-password-123 (viewer)

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001';
  v_owner uuid := '00000000-0000-4000-8000-0000000000a1';
  v_viewer uuid := '00000000-0000-4000-8000-0000000000a2';
  v_u uuid;
  v_email text;
begin
  foreach v_u in array array[v_owner, v_viewer] loop
    v_email := case when v_u = v_owner then 'demo@benchflow.local' else 'viewer@benchflow.local' end;
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_u, 'authenticated', 'authenticated', v_email,
      extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', split_part(v_email, '@', 1)),
      now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_u, v_u::text, jsonb_build_object('sub', v_u::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now());
  end loop;

  insert into public.organizations (id, name, slug, is_demo) values (v_org, 'Demo Staffing (synthetic)', 'demo-staffing', true);
  insert into public.user_roles (user_id, organization_id, role) values (v_owner, v_org, 'owner'), (v_viewer, v_org, 'viewer');
  perform public.provision_default_connectors(v_org);

  insert into public.vendors (organization_id, name, category, website, specializations, coverage, verification_status, info_source, notes) values
    (v_org, 'Northwind Talent Partners', 'staffing', 'https://northwind.example.com', '{Java,Cloud}', '{TX,NJ}', 'unverified', 'synthetic seed', 'Fictional demo vendor'),
    (v_org, 'Contoso Prime Services', 'prime_vendor', 'https://contoso.example.com', '{Data,Cloud}', '{US}', 'unverified', 'synthetic seed', 'Fictional demo vendor'),
    (v_org, 'Fabrikam Systems Integration', 'implementation_partner', 'https://fabrikam.example.com', '{SAP,Salesforce}', '{US}', 'unverified', 'synthetic seed', 'Fictional demo vendor'),
    (v_org, 'Tailspin Bank (demo client)', 'end_client', 'https://tailspin.example.com', '{}', '{TX}', 'unverified', 'synthetic seed', 'Fictional demo client'),
    (v_org, 'Litware Health (demo client)', 'end_client', 'https://litware.example.com', '{}', '{NJ}', 'unverified', 'synthetic seed', 'Fictional demo client'),
    (v_org, 'Adatum Staffing', 'staffing', 'https://adatum.example.com', '{QA,DevOps}', '{CA,WA}', 'unverified', 'synthetic seed', 'Fictional demo vendor');
end $$;

with v as (select id, name from public.vendors where organization_id = '00000000-0000-4000-8000-000000000001'),
jobs(title, skills, city, state, arrangement, etype, rmin, rmax, unit, tax, visa, src, cat, jobid, vendor, prime, partner, client, hours_ago, status, descr, sender) as (values
  ('Senior Java Developer', '{Java,Spring Boot,AWS,Microservices}'::text[], 'Dallas', 'TX', 'hybrid', 'contract', 70, 80, 'hour', '{C2C,W2}'::text[], '{H1B,GC,USC}'::text[], 'Prohires mailbox', 'email', 'PH-1001', 'Northwind Talent Partners', 'Contoso Prime Services', null, 'Tailspin Bank (demo client)', 2, 'active', 'Build Spring Boot microservices on AWS for a retail banking platform. 10+ years Java required.', 'recruiter1@northwind.example.com'),
  ('Java Full Stack Developer', '{Java,React,AWS}', 'Plano', 'TX', 'onsite', 'contract', 65, null, 'hour', '{C2C}', '{H1B transfer}', 'Work mailbox', 'email', 'WK-2001', 'Adatum Staffing', null, null, null, 5, 'active', 'Java + React engineer for a payments modernization program. H1B transfer accepted.', 'jobs@adatum.example.com'),
  ('Data Engineer', '{Snowflake,dbt,Python,Airflow}', 'Austin', 'TX', 'remote', 'contract', 75, 85, 'hour', '{C2C}', '{}', 'Prohires mailbox', 'email', 'PH-1002', 'Northwind Talent Partners', 'Contoso Prime Services', null, null, 20, 'active', 'Design Snowflake pipelines with dbt and Airflow. Remote, Texas candidates preferred.', 'recruiter2@northwind.example.com'),
  ('Senior Data Engineer', '{Databricks,Apache Spark,Azure}', 'Houston', 'TX', 'hybrid', 'contract_to_hire', 80, 90, 'hour', '{W2}', '{GC,USC}', 'CSV import', 'csv', 'CSV-3001', 'Adatum Staffing', null, null, 'Tailspin Bank (demo client)', 30, 'active', 'Databricks lakehouse build on Azure. Spark streaming experience required.', null),
  ('.NET Developer', '{.NET,C#,Azure,SQL Server}', 'Jersey City', 'NJ', 'hybrid', 'contract', 68, 72, 'hour', '{C2C}', '{H1B transfer,GC}', 'Personal mailbox', 'email', 'PE-4001', 'Northwind Talent Partners', null, 'Fabrikam Systems Integration', 'Litware Health (demo client)', 3, 'active', 'ASP.NET Core APIs and Azure Functions for a healthcare claims system.', 'hotlist@northwind.example.com'),
  ('Business Analyst', '{SQL,Power BI}', null, null, 'remote', 'contract', 55, 60, 'hour', '{C2C,W2}', '{}', 'Work mailbox', 'email', 'WK-2002', 'Adatum Staffing', null, null, null, 8, 'active', 'Remote business analyst for claims analytics. Requirements gathering, SQL and Power BI dashboards.', 'jobs@adatum.example.com'),
  ('React Developer', '{React,Node.js,TypeScript}', 'Newark', 'NJ', 'hybrid', 'contract', 60, 65, 'hour', '{C2C}', '{}', 'Prohires mailbox', 'email', 'PH-1003', 'Northwind Talent Partners', null, null, 'Litware Health (demo client)', 1, 'active', 'React and Node.js engineer for patient portal. New Jersey hybrid, 3 days onsite.', 'recruiter1@northwind.example.com'),
  ('Node.js Backend Engineer', '{Node.js,TypeScript,PostgreSQL,Docker}', 'Princeton', 'NJ', 'onsite', 'full_time', 140000, 160000, 'year', '{W2}', '{USC,GC}', 'Manual entry', 'manual', null, null, null, null, null, 50, 'active', 'Full-time Node.js engineer. Salary 140k-160k.', null),
  ('QA Automation Engineer', '{QA Automation,Selenium,Java,Cypress}', 'Seattle', 'WA', 'hybrid', 'contract', 55, 62, 'hour', '{C2C,1099}', '{}', 'Work mailbox', 'email', 'WK-2003', 'Adatum Staffing', null, null, null, 26, 'active', 'Selenium and Cypress automation for e-commerce checkout flows.', 'jobs@adatum.example.com'),
  ('DevOps Engineer', '{Kubernetes,Terraform,AWS,CI/CD}', 'San Jose', 'CA', 'remote', 'contract', 75, 85, 'hour', '{C2C}', '{H1B,GC}', 'CSV import', 'csv', 'CSV-3002', 'Adatum Staffing', null, null, null, 72, 'active', 'EKS platform engineering with Terraform and GitHub Actions.', null),
  ('Salesforce Developer', '{Salesforce}', 'Charlotte', 'NC', 'hybrid', 'contract', 70, null, 'hour', '{C2C}', '{}', 'Prohires mailbox', 'email', 'PH-1004', 'Northwind Talent Partners', null, 'Fabrikam Systems Integration', null, 100, 'needs_review', 'Apex and LWC development. Rate to be confirmed.', 'recruiter2@northwind.example.com'),
  ('SAP ABAP Consultant', '{SAP}', 'Chicago', 'IL', 'onsite', 'contract', null, null, null, '{}', '{}', 'Personal mailbox', 'email', 'PE-4002', null, null, 'Fabrikam Systems Integration', null, 200, 'expired', 'S/4HANA ABAP consultant. Requirement closed per vendor.', 'hotlist@northwind.example.com'),
  ('Python Developer', '{Python,Machine Learning,AWS}', 'Atlanta', 'GA', 'remote', 'contract', 65, 75, 'hour', '{C2C}', '{}', 'Work mailbox', 'email', 'WK-2004', 'Adatum Staffing', null, null, null, 4, 'active', 'Python ML engineer building forecasting models on SageMaker.', 'jobs@adatum.example.com'),
  ('Scrum Master', '{Scrum Master}', 'Phoenix', 'AZ', 'hybrid', 'contract', 55, null, 'hour', '{W2}', '{USC}', 'Manual entry', 'manual', null, null, null, null, null, 150, 'closed', 'Scrum master for two agile teams. Position filled.', null),
  ('Java Developer', '{Java,Spring Boot,Kafka}', 'Irving', 'TX', 'onsite', 'contract', 62, 68, 'hour', '{C2C}', '{H1B}', 'Work mailbox', 'email', 'WK-2005', 'Adatum Staffing', 'Contoso Prime Services', null, 'Tailspin Bank (demo client)', 10, 'active', 'Kafka event streaming with Spring Boot for card processing.', 'jobs@adatum.example.com')
)
insert into public.job_requirements (organization_id, title, description, skills, location_city, location_state, work_arrangement, employment_type,
  rate_min, rate_max, rate_unit, tax_terms, visa_requirements, source_name, source_category, source_job_id,
  vendor_id, prime_vendor_id, implementation_partner_id, end_client_id, date_received, status, source_sender, extraction_confidence)
select '00000000-0000-4000-8000-000000000001', j.title, j.descr, j.skills, j.city, j.state, j.arrangement, j.etype,
  j.rmin, j.rmax, j.unit, j.tax, j.visa, j.src, j.cat, j.jobid,
  (select id from v where name = j.vendor), (select id from v where name = j.prime), (select id from v where name = j.partner), (select id from v where name = j.client),
  now() - make_interval(hours => j.hours_ago), j.status, j.sender, case when j.cat = 'email' then 0.9 end
from jobs j;

insert into public.requirement_sources (organization_id, requirement_id, source_name, source_category, sender, seen_at)
select organization_id, id, source_name, source_category, source_sender, date_received
from public.job_requirements where organization_id = '00000000-0000-4000-8000-000000000001';

insert into public.consultants (organization_id, display_name, primary_skills, years_experience, current_location, work_arrangement_pref, availability_date, target_rate, target_rate_unit, active)
values
  ('00000000-0000-4000-8000-000000000001', 'Consultant A (synthetic)', '{Java,Spring Boot,AWS}', 11, 'Dallas, TX', 'hybrid', current_date + 7, 70, 'hour', true),
  ('00000000-0000-4000-8000-000000000001', 'Consultant B (synthetic)', '{Snowflake,dbt,Python}', 8, 'Austin, TX', 'remote', current_date, 75, 'hour', true);
