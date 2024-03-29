# nuget-license-check-action
This action checks licenses of nuget packages and fails if finding licenses that are not allowed.\
It also shows an overview of packages with license information.\
We are using [nuget-license](https://github.com/tomchavakis/nuget-license) to do the checks.

## Inputs
see action definition [action.yaml](action.yaml)\
projectsFilter defaults to "Test.csproj"

## License Mappings
This action also supports mappings for nuget packages without licenseType.\
Supports deprecated licenseUrls, by reading licenseUrls.json in your projectDir. [sample](sample/licenseUrls.json)\
Supports mapping of packages with licenseFile only, by reading licenseInfos.json in your projectDir. [sample](sample/licenseInfos.json)

## Example usage

```yaml
uses: SamhammerAG/nuget-license-check-action@v1
with:
  projectDir: 'sources/app'
  allowedLicenses: 'MIT;Apache-2.0'
  exportDir: 'sources/app/wwwroot'
```

## Sample Outputs

Shows which package uses which licenses.
```
 | Reference                         | Version  | License Type | License                                                         |
 |-------------------------------------------------------------------------------------------------------------------------------|
 | AspNetCore.HealthChecks.Redis     | 6.0.4    | Apache-2.0   | https://licenses.nuget.org/Apache-2.0                           |
 | AspNetCore.HealthChecks.SqlServer | 6.0.2    | Apache-2.0   | https://licenses.nuget.org/Apache-2.0                           |
 | CompareNETObjects                 | 4.78.0   | MS-PL        | https://www.nuget.org/packages/CompareNETObjects/4.78.0/License |
 | Flurl                             | 3.0.2    | MIT          | https://licenses.nuget.org/MIT                                  |
 | MimeMapping                       | 1.0.1.37 | MIT          | https://github.com/zone117x/MimeMapping/blob/master/LICENSE.md  |
 | Polly                             | 7.2.3    | BSD-3-Clause | https://licenses.nuget.org/BSD-3-Clause                         |
 | Swashbuckle.AspNetCore            | 6.2.3    | MIT          | https://licenses.nuget.org/MIT                                  |
```

Shows which package uses license that is not allowed.
```
NugetUtility.InvalidLicensesException`1[NugetUtility.LibraryInfo]: Only the following licenses are allowed: NONE
Project () Package(AspNetCore.HealthChecks.Redis-6.0.4) LicenseUrl(https://licenses.nuget.org/Apache-2.0) License Type (Apache-2.0)
```

With the optional parameter "exportDir" set, you will also get a licenses.html generated to the configured directory. It contains the used nuget packages with it's license and the license text.
