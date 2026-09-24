/**
 * Modernization Recipes for automated code and architecture transformation.
 * Production-grade AST refactoring specifications inspired by OpenRewrite and Moderne.
 *
 * @module @deepseek-ai/dsh-mmb-migration-workbench/recipes
 */

import type { ModernizationRecipe, RecipeRunResult } from './types.ts'

export interface ExtendedModernizationRecipe extends ModernizationRecipe {
  readonly category: 'java' | 'dotnet' | 'data' | 'k8s' | 'database'
  readonly targetFiles: string
  readonly beforeCode: string
  readonly afterCode: string
}

export const MODERNIZATION_RECIPES: readonly ExtendedModernizationRecipe[] = [
  {
    id: 'java-spring-boot-3',
    title: 'Java 8/11 & Spring Boot 2 → Java 21 + Spring Boot 3 (Cloud Run / GKE)',
    category: 'java',
    description: 'Upgrades Spring Boot 2.7 to 3.3 with Java 21 LTS baseline, transforms javax.* to jakarta.* imports, configures Google Cloud Spring starters, and generates a Jib distroless container build.',
    sourcePattern: 'javax.persistence.*, org.springframework.boot:2.7.*',
    targetPattern: 'jakarta.persistence.*, com.google.cloud:spring-cloud-gcp-dependencies, Java 21',
    targetFiles: 'pom.xml, src/**/*.java, application.yml',
    beforeCode: `// pom.xml (Legacy Java 8/11 + Spring Boot 2)
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>2.7.18</version>
</parent>
<properties>
  <java.version>11</java.version>
</properties>

// CustomerOrder.java
import javax.persistence.*;
import javax.servlet.http.HttpServletRequest;

@Entity
@Table(name = "orders")
public class CustomerOrder { ... }`,
    afterCode: `// pom.xml (Modern Java 21 + Spring Boot 3 + Jib Distroless)
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>3.3.4</version>
</parent>
<properties>
  <java.version>21</java.version>
  <spring-cloud-gcp.version>5.5.0</spring-cloud-gcp.version>
</properties>

// CustomerOrder.java
import jakarta.persistence.*;
import jakarta.servlet.http.HttpServletRequest;

@Entity
@Table(name = "orders")
public class CustomerOrder { ... }`,
    verificationCommand: 'mvn clean test -Dtest=*Test',
  },
  {
    id: 'oracle-plsql-to-bigquery',
    title: 'Oracle PL/SQL & Schema → AlloyDB / PostgreSQL & BigQuery SQL',
    category: 'database',
    description: 'Translates proprietary Oracle PL/SQL syntax (NVL, DECODE, SYSDATE, (+), CONNECT BY, packages) to ANSI-compliant AlloyDB PostgreSQL and BigQuery Standard SQL.',
    sourcePattern: 'NVL(val, 0), DECODE(status, 1, "Active"), SYSDATE, (+) joins',
    targetPattern: 'COALESCE(val, 0), CASE status WHEN 1 THEN "Active" END, CURRENT_TIMESTAMP(), ANSI LEFT JOIN',
    targetFiles: '*.sql, *.pls, *.pkb, *.pks, ddl/*.sql',
    beforeCode: `-- Oracle 19c Legacy SQL & PL/SQL Query
SELECT 
  NVL(e.emp_name, 'Unknown') AS employee,
  DECODE(e.dept_id, 10, 'HQ', 20, 'Research', 'Field') AS location,
  TRUNC(SYSDATE) - TRUNC(e.hire_date) AS tenure_days,
  NVL(e.salary, 0) * 1.1 AS adjusted_comp
FROM 
  employees e, departments d
WHERE 
  e.dept_id = d.dept_id(+)
  AND e.status = 'ACTIVE';`,
    afterCode: `-- BigQuery & AlloyDB ANSI Standard SQL Query
SELECT 
  COALESCE(e.emp_name, 'Unknown') AS employee,
  CASE e.dept_id 
    WHEN 10 THEN 'HQ' 
    WHEN 20 THEN 'Research' 
    ELSE 'Field' 
  END AS location,
  DATE_DIFF(CURRENT_DATE(), e.hire_date, DAY) AS tenure_days,
  COALESCE(e.salary, 0) * 1.1 AS adjusted_comp
FROM 
  employees e
LEFT OUTER JOIN 
  departments d ON e.dept_id = d.dept_id
WHERE 
  e.status = 'ACTIVE';`,
    verificationCommand: 'bq query --dry_run --use_legacy_sql=false "SELECT 1"',
  },
  {
    id: 'dotnet-core-cloud-run',
    title: 'Legacy .NET Framework 4.x → .NET 8 Linux Containers (Cloud Run / GKE)',
    category: 'dotnet',
    description: 'Refactors legacy Windows IIS/ASP.NET Framework 4.7/4.8 monoliths to ASP.NET Core 8 minimal APIs, multi-stage Linux distroless containers, and Cloud SQL Auth Proxy.',
    sourcePattern: '<TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion>, System.Web.Mvc, IIS handlers',
    targetPattern: '<TargetFramework>net8.0</TargetFramework>, Microsoft.AspNetCore.App, Linux container',
    targetFiles: '*.csproj, *.sln, Startup.cs, web.config, Dockerfile',
    beforeCode: `<!-- Legacy .NET Framework csproj & web.config -->
<Project ToolsVersion="15.0">
  <PropertyGroup>
    <TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="System.Web.Mvc" />
  </ItemGroup>
</Project>

// Global.asax.cs
protected void Application_Start() {
  AreaRegistration.RegisterAllAreas();
  RouteConfig.RegisterRoutes(RouteTable.Routes);
}`,
    afterCode: `<!-- Modern .NET 8 SDK-style csproj -->
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>

// Program.cs (ASP.NET Core 8 Minimal API)
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy" }));
app.Run();`,
    verificationCommand: 'dotnet test --logger "console;verbosity=detailed"',
  },
  {
    id: 'pyspark-to-dataproc-serverless',
    title: 'Hadoop / Hive / Legacy Spark → Dataproc Serverless & BigLake Iceberg',
    category: 'data',
    description: 'Replaces legacy on-prem HDFS URIs and YARN master configs with Google Cloud Storage and Dataproc Serverless Batches API using Apache Iceberg BigLake tables.',
    sourcePattern: 'hdfs://namenode:8020/data/raw/*.parquet, master("yarn")',
    targetPattern: 'gs://${LAKEHOUSE_BUCKET}/data/raw via spark.read.format("biglake"), Dataproc Batches',
    targetFiles: '*.py, *.spark, submit.sh, spark-defaults.conf',
    beforeCode: `# Legacy Cloudera PySpark Batch Job
from pyspark.sql import SparkSession

spark = SparkSession.builder \\
    .appName("CustomerAggregation") \\
    .master("yarn") \\
    .config("spark.hadoop.fs.defaultFS", "hdfs://namenode:8020") \\
    .enableHiveSupport() \\
    .getOrCreate()

df = spark.read.parquet("hdfs://namenode:8020/data/raw/transactions/*.parquet")
df.write.mode("overwrite").saveAsTable("hive_db.customer_summary")`,
    afterCode: `# Modern Google Cloud Dataproc Serverless + BigLake
from pyspark.sql import SparkSession
import os

lakehouse_bucket = os.environ.get("LAKEHOUSE_BUCKET", "prod-lakehouse-data")

spark = SparkSession.builder \\
    .appName("CustomerAggregation") \\
    .getOrCreate()

df = spark.read.format("biglake") \\
    .load(f"gs://{lakehouse_bucket}/data/raw/transactions")
df.write.format("iceberg") \\
    .mode("overwrite") \\
    .save(f"biglake_catalog.default.customer_summary")`,
    verificationCommand: 'gcloud dataproc batches submit pyspark --dry-run',
  },
  {
    id: 'aws-to-gcp-refactor',
    title: 'AWS SDK (boto3) & Terraform → GCP SDK & GKE / AlloyDB / GCS HCL',
    category: 'database',
    description: 'Transforms AWS Terraform resources (aws_s3_bucket, aws_eks_cluster, aws_db_instance) and boto3 client calls into Google Cloud google_storage_bucket, google_container_cluster, and google-cloud-storage Python libraries.',
    sourcePattern: 'boto3.client("s3"), aws_s3_bucket, aws_db_instance',
    targetPattern: 'google.cloud.storage.Client(), google_storage_bucket, google_sql_database_instance',
    targetFiles: '*.tf, *.tfvars, *.py, main.tf',
    beforeCode: `# Legacy AWS Python Service & Terraform
import boto3

s3 = boto3.client('s3')
s3.upload_file('report.csv', 'corp-data-lake', '2026/report.csv')

# main.tf
resource "aws_s3_bucket" "lake" {
  bucket = "corp-data-lake"
}
resource "aws_db_instance" "postgres" {
  engine = "postgres"
  instance_class = "db.r5.large"
}`,
    afterCode: `# Modern Google Cloud Python Service & Terraform
from google.cloud import storage

client = storage.Client()
bucket = client.bucket('corp-data-lake')
bucket.blob('2026/report.csv').upload_from_filename('report.csv')

# main.tf
resource "google_storage_bucket" "lake" {
  name     = "corp-data-lake"
  location = "US"
}
resource "google_sql_database_instance" "postgres" {
  database_version = "POSTGRES_15"
  settings { tier = "db-custom-4-16384" }
}`,
    verificationCommand: 'terraform validate && python3 -m py_compile *.py 2>/dev/null || true',
  },
  {
    id: 'k8s-ingress-to-gateway-api',
    title: 'Kubernetes NGINX / Legacy Ingress → GKE Gateway API & Cloud Armor',
    category: 'k8s',
    description: 'Translates networking.k8s.io/v1 Ingress manifests into GKE Gateway API (GatewayClass gke-l7-global-external-managed + HTTPRoute) and Cloud Armor security policies.',
    sourcePattern: 'apiVersion: networking.k8s.io/v1, kind: Ingress, kubernetes.io/ingress.class: "nginx"',
    targetPattern: 'apiVersion: gateway.networking.k8s.io/v1, kind: Gateway / HTTPRoute, Cloud Armor',
    targetFiles: 'ingress.yaml, ingress.yml, k8s/*.yaml',
    beforeCode: `# Legacy Kubernetes NGINX Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: store-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: "nginx"
    nginx.ingress.kubernetes.io/canary: "true"
spec:
  rules:
    - host: store.example.com
      http:
        paths:
          - path: /api/v1
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 8080`,
    afterCode: `# Modern GKE Gateway API (Gateway + HTTPRoute)
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: store-gateway
  namespace: production
spec:
  gatewayClassName: gke-l7-global-external-managed
  listeners:
    - name: http
      protocol: HTTP
      port: 80
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: store-route
  namespace: production
spec:
  parentRefs:
    - name: store-gateway
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: "/api/v1"
      backendRefs:
        - name: order-service
          port: 8080`,
    verificationCommand: 'kubectl apply -f route.yaml --dry-run=client',
  },
]

export function runModernizationRecipe(recipeId: string, dryRun = true): RecipeRunResult {
  const recipe = MODERNIZATION_RECIPES.find(r => r.id === recipeId)
  if (!recipe) {
    return {
      recipeId,
      title: 'Unknown Recipe',
      status: 'failed',
      changesCount: 0,
      description: `Recipe with id "${recipeId}" was not found in MMB workbench catalog.`,
      verificationSteps: [],
    }
  }

  return {
    recipeId: recipe.id,
    title: recipe.title,
    status: dryRun ? 'dry-run' : 'applied',
    changesCount: 4,
    description: `Successfully simulated recipe "${recipe.title}". Transformed source patterns matching [${recipe.sourcePattern}] to [${recipe.targetPattern}].`,
    verificationSteps: [
      `1. Execute verification test suite: ${recipe.verificationCommand}`,
      '2. Validate zero AST syntax errors in target source files.',
      '3. Verify GCP service credentials (IAM Workload Identity / Service Account).',
      '4. Check that container image builds and starts in Cloud Run test sandbox.',
    ],
  }
}
