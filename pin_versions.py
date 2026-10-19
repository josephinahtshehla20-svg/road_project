"""Run once from the road_project folder: python pin_versions.py
Writes backend/requirements.txt using the SAME library versions that trained your model,
so the model file loads correctly inside Docker."""
import joblib, numpy, pandas, sklearn

lines = ["fastapi", "uvicorn[standard]", "sqlalchemy", "psycopg2-binary",
         f"scikit-learn=={sklearn.__version__}", f"pandas=={pandas.__version__}",
         f"numpy=={numpy.__version__}", f"joblib=={joblib.__version__}"]
open("backend/requirements.txt", "w").write("\n".join(lines) + "\n")
print("Wrote backend/requirements.txt:")
print("\n".join(lines))
