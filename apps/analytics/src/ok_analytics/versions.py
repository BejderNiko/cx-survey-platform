"""Library versions recorded on every analysis run."""
from __future__ import annotations

import numpy
import pandas
import scipy
import sklearn
import statsmodels


def library_versions() -> dict[str, str]:
    return {
        "python": __import__("sys").version.split()[0],
        "numpy": numpy.__version__,
        "pandas": pandas.__version__,
        "scipy": scipy.__version__,
        "statsmodels": statsmodels.__version__,
        "scikit-learn": sklearn.__version__,
    }
