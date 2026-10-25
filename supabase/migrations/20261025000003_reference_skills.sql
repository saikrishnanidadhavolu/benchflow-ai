-- Global skill taxonomy and synonyms used for search expansion and normalization.
with data(name, category, aliases) as (values
  ('Java', 'language', array['core java', 'j2ee', 'java ee', 'jakarta ee']),
  ('Spring Boot', 'framework', array['springboot', 'spring-boot']),
  ('Python', 'language', array['py']),
  ('JavaScript', 'language', array['js', 'ecmascript']),
  ('TypeScript', 'language', array['ts']),
  ('React', 'frontend', array['reactjs', 'react.js']),
  ('Angular', 'frontend', array['angularjs', 'angular.js']),
  ('Vue.js', 'frontend', array['vue', 'vuejs']),
  ('Node.js', 'backend', array['node', 'nodejs']),
  ('.NET', 'framework', array['dotnet', 'dot net', '.net core', 'asp.net', 'asp.net core']),
  ('C#', 'language', array['csharp', 'c sharp']),
  ('C++', 'language', array['cpp']),
  ('Go', 'language', array['golang']),
  ('Ruby on Rails', 'framework', array['rails', 'ror']),
  ('PHP', 'language', array[]::text[]),
  ('SQL', 'data', array['t-sql', 'tsql', 'pl/sql', 'plsql']),
  ('PostgreSQL', 'data', array['postgres', 'psql']),
  ('Oracle', 'data', array['oracle db']),
  ('SQL Server', 'data', array['mssql', 'ms sql']),
  ('MongoDB', 'data', array['mongo']),
  ('Snowflake', 'data', array[]::text[]),
  ('Databricks', 'data', array[]::text[]),
  ('Apache Spark', 'data', array['spark', 'pyspark']),
  ('Kafka', 'data', array['apache kafka']),
  ('Airflow', 'data', array['apache airflow']),
  ('dbt', 'data', array['data build tool']),
  ('Hadoop', 'data', array['hdfs']),
  ('Informatica', 'data', array['informatica powercenter', 'iics']),
  ('Tableau', 'analytics', array[]::text[]),
  ('Power BI', 'analytics', array['powerbi']),
  ('AWS', 'cloud', array['amazon web services']),
  ('Azure', 'cloud', array['microsoft azure']),
  ('GCP', 'cloud', array['google cloud', 'google cloud platform']),
  ('Kubernetes', 'devops', array['k8s', 'eks', 'aks', 'gke']),
  ('Docker', 'devops', array['containers']),
  ('Terraform', 'devops', array['hcl']),
  ('Jenkins', 'devops', array[]::text[]),
  ('CI/CD', 'devops', array['cicd', 'ci cd']),
  ('Ansible', 'devops', array[]::text[]),
  ('Linux', 'infrastructure', array['unix', 'rhel']),
  ('Selenium', 'qa', array['selenium webdriver']),
  ('Cypress', 'qa', array[]::text[]),
  ('Playwright', 'qa', array[]::text[]),
  ('QA Automation', 'qa', array['test automation', 'automation testing', 'sdet']),
  ('Salesforce', 'crm', array['sfdc', 'apex', 'lwc']),
  ('ServiceNow', 'itsm', array['snow']),
  ('SAP', 'erp', array['sap s/4hana', 's4hana', 'sap abap', 'abap']),
  ('Workday', 'erp', array[]::text[]),
  ('Guidewire', 'insurance', array[]::text[]),
  ('Machine Learning', 'ai', array['ml']),
  ('Generative AI', 'ai', array['genai', 'gen ai', 'llm', 'llms']),
  ('Data Engineer', 'role', array['data engineering']),
  ('Business Analyst', 'role', array['ba']),
  ('Scrum Master', 'role', array['agile coach']),
  ('Project Manager', 'role', array['pm']),
  ('DevOps Engineer', 'role', array['site reliability engineer', 'sre']),
  ('Full Stack Developer', 'role', array['full stack', 'fullstack', 'full-stack']),
  ('Microservices', 'architecture', array['micro services', 'micro-services']),
  ('REST API', 'architecture', array['rest', 'restful', 'rest apis']),
  ('GraphQL', 'architecture', array[]::text[])
), ins as (
  insert into public.skills (name, category)
  select name, category from data
  on conflict do nothing
  returning id, name
)
insert into public.skill_aliases (skill_id, alias)
select s.id, a.alias
from data d
join public.skills s on s.organization_id is null and lower(s.name) = lower(d.name)
cross join lateral unnest(d.aliases) as a(alias)
on conflict do nothing;
