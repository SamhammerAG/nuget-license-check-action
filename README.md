# nuget-license-check-action
This action checks licenses of nuget packages and fails if finding licenses that are not allowed.\
It also shows an overview of packages with license information.\
We are using [nuget-license](https://github.com/tomchavakis/nuget-license) to do the checks.

## Inputs
see action definition [action.yaml](action.yaml)

## Example usage

```yaml
uses: SamhammerAG/nuget-license-check-action@v1
with:
  projectDir: 'sources/app'
  allowedLicenses: 'MIT;Apache-2.0'
```

## Sample Outputs

Shows which package uses which licenses.
```
| Reference                                                           | Version                | License Type    | License                                                                                | 
 |---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------| 
 | AngleSharp                                                          | 0.16.1                 | MIT             | https://licenses.nuget.org/MIT                                                         | 
 | AspNetCore.HealthChecks.Redis                                       | 6.0.4                  | Apache-2.0      | https://licenses.nuget.org/Apache-2.0                                                  | 
 | AspNetCore.HealthChecks.SqlServer                                   | 6.0.2                  | Apache-2.0      | https://licenses.nuget.org/Apache-2.0                                                  | 
 | AspNetCore.HealthChecks.UI.Client                                   | 6.0.2                  | Apache-2.0      | https://licenses.nuget.org/Apache-2.0                                                  | 
```
