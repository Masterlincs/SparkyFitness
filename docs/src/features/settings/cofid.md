# McCance and Widdowson's CoFID (UK)

McCance and Widdowson's _Composition of Foods Integrated Dataset_ (CoFID) is the UK's official food composition table, published on GOV.UK. The 2021 release covers about 2,900 foods commonly eaten in the UK: fruit, vegetables, meat, fish, dairy, bread, drinks and home-cooked dishes such as shepherd's pie.

SparkyFitness provides **live on-demand search** of CoFID.

## Features

- **Zero configuration**: enabled globally as a default provider, with no API keys, accounts or credentials.
- **UK nutrient values**: energy (kcal), protein, fat, saturated, monounsaturated, polyunsaturated and trans fat, carbohydrate, total sugars, fibre (AOAC, the method UK food labels use, falling back to NSP), sodium, potassium, calcium, iron, cholesterol, vitamin A (retinol equivalent), vitamin C, water and alcohol. Every other CoFID proximate, mineral and vitamin value is kept as a provider nutrient, so it can be mapped to a custom nutrient.
- **100 g basis**: values are per 100 g of food, or per 100 ml for alcoholic drinks, as in the dataset.
- **Trace values**: CoFID's `Tr` (trace) is read as 0. `N` (present but not measured) is left out rather than shown as 0.

CoFID describes generic foods, not branded products, so it has no barcodes. For packaged products, scan the barcode with Open Food Facts.

## How it works

CoFID has no free API. The dataset is a single Excel workbook on GOV.UK, so the server downloads it (about 4.6 MB) the first time anyone searches CoFID, reads it once and keeps it in memory until the server restarts. If the download fails, the search shows an error and the next search tries again. The server needs outbound HTTPS access to `assets.publishing.service.gov.uk`.

## Default Provider Availability

CoFID is included as a **default global provider** on every SparkyFitness instance. All users can search and log UK foods from both the web and mobile apps without any configuration.

Administrators can view and manage the provider under **Settings → Food & Exercise Data Providers**.

## Using CoFID

- **Web**: results appear under the **McCance and Widdowson's CoFID (UK)** section in the food search dialog, or when selecting that provider.
- **Mobile**: select **McCance and Widdowson's CoFID (UK)** from the online provider filter on the food search screen.

## Licensing and Attribution

Contains public sector information licensed under the Open Government Licence v3.0.

- **Licence**: [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)
- **Dataset**: [Composition of foods integrated dataset (CoFID) on GOV.UK](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid)
