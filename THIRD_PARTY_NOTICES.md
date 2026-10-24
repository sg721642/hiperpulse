# Sources and attribution

## Project brief

The user supplied `Hack Day_ PS.pdf` (Hacktoberfest Hack Day KodeKurrent S2 Jais x Open Science Labs). HiperPulse appears on pages 5–6. This package implements that selected challenge; it does not claim ownership of the event brief. The PDF is not redistributed in the ZIP.

## Signal method

GREEN is an established remote photoplethysmography baseline: Verkruysse, W., Svaasand, L. O., and Nelson, J. S. (2008). *Remote plethysmographic imaging using ambient light*. Optics Express 16, 21434–21445. https://doi.org/10.1364/OE.16.021434

rPPG-Toolbox by ubicomplab was consulted as the brief's methodological reference: https://github.com/ubicomplab/rPPG-Toolbox . Its GREEN method illustrates use of the spatial green-channel mean. Its POS implementation was reviewed as an alternative; POS is **not implemented** in this package. The full Toolbox is not installed, run or vendored. Do not claim its trained models, benchmark performance or published accuracy for this prototype.

The provided application and quality heuristics are independently written. NumPy and SciPy implement the numerical operations. Welch's method is an established spectral estimator; zero padding is not new physical information. If future contributors copy Toolbox source, preserve its exact license/notices and record the source revision before redistribution.

## Supporting software and services

- Python: https://www.python.org/
- NumPy: https://numpy.org/
- SciPy: https://scipy.org/ ; method documentation https://docs.scipy.org/doc/scipy/reference/signal.html
- FastAPI: https://fastapi.tiangolo.com/
- Uvicorn: https://www.uvicorn.org/
- HTTPX: https://www.python-httpx.org/
- python-dotenv: https://github.com/theskumar/python-dotenv
- pytest: https://docs.pytest.org/
- Browser frame API: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- Gemma 4 through Gemini API: https://gemma.ai/deployment/gemini-api/
- Google Antigravity project tooling: https://antigravity.google/docs/
- DigitalOcean App Platform: https://docs.digitalocean.com/products/app-platform/

Dependency licenses remain with their authors. Installed distributions retain their license metadata. No Gemma weights are redistributed; access and provider terms apply to the hosted API. A model's open-weight status does not mean the hosted endpoint is private or free.

## Data and original contributions

Included fixtures are generated mathematically with a fixed seed. They contain no actual human capture and provide no clinical validation. Do not relabel them as real measurements.

Project contribution: browser-to-trace capture, transparent evidence receipt, all-gates abstention policy, artifact comparison, optional evidence-grounded Gemma commentary, frontend, tests and handoff documentation. The team should record its actual changes and disclose AI-assisted development according to event rules.

Before public release, choose a license for the team's original code. This file supplies attribution, not a legal license grant for every referenced resource.
