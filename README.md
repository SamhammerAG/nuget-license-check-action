# nuget-license-check-action
This action checks licenses of nuget packages and fails if finding licenses that are not allowed.\
It also shows an overview of packages with license information.

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
TODO
