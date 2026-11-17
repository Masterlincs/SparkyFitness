# UK Foods & Portions (Intake24)

The Intake24 UK food database lists about 2,500 foods as people in the UK report eating them, from boiled eggs and toast to a standard bag of crisps. Newcastle University built it for the National Diet and Nutrition Survey, and it is published under the Open Government Licence v3.0.

SparkyFitness provides **live on-demand search** of Intake24.

## Features

* **Zero configuration**: enabled globally as a default provider, with no API keys, accounts or credentials.
* **UK household portions**: each food keeps a per-100 g serving and adds the portions Intake24 records for it, such as **medium egg (50 g)**, **slice, medium (27 g)**, **Walkers - standard (35 g)** or **small / medium / large portion**. Choose one when you add the food.
* **NDNS nutrients**: energy, protein, fat, saturated, monounsaturated, polyunsaturated (omega-3 plus omega-6) and trans fat, carbohydrate, total sugars, fibre (Englyst), cholesterol, sodium, potassium, calcium, iron, vitamins A and C, water and alcohol, from the National Diet and Nutrition Survey nutrient databank.

Intake24 describes foods, not barcoded products. For packaged products, scan the barcode with Open Food Facts. For the official UK composition table, see [CoFID](/features/settings/cofid).

## How it works

The server downloads the archived Intake24 data files from GitHub (about 4 MB) the first time anyone searches Intake24, reads them once and keeps them in memory until the server restarts. If the download fails, the search shows an error and the next search tries again. The server needs outbound HTTPS access to `raw.githubusercontent.com`.

A handful of foods whose NDNS values are not per 100 g (sweetener tablets, for example) are left out.

## Licensing and Attribution

Contains the Intake24 food database, © Crown copyright and Newcastle University, licensed under the Open Government Licence v3.0.

* **Licence**: [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)
* **Data**: [intake24-legacy/xml-data on GitHub](https://github.com/intake24-legacy/xml-data)
* **Project**: [Intake24 open source](https://intake24.org/open-source)
