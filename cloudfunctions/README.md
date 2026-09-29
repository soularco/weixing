# Cloud functions

This directory is reserved for WeChat Cloud Development functions.

Recommended additions:

- `forecast`: reads sales and traffic history, returns forecast results.
- `schedule`: calculates staffing suggestions from traffic and skills.
- `replenish`: calculates stock coverage and recommended order quantities.
- `aiExplain`: calls an approved AI model and returns a structured explanation.

Do not put model API keys in the mini program source. Store them only in cloud function environment variables.
