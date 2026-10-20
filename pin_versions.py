"""Optional: python pin_versions.py (from the road_project folder) rewrites backend/requirements.txt
with the library versions installed on YOUR computer, so the model file loads the same way in Docker."""
import joblib, numpy, pandas, sklearn

lines = ["fastapi", "uvicorn[standard]", "sqlalchemy", "psycopg2-binary", "bcrypt", "PyJWT",
         f"scikit-learn=={sklearn.__version__}", f"pandas=={pandas.__version__}",
         f"numpy=={numpy.__version__}", f"joblib=={joblib.__version__}"]
open("backend/requirements.txt", "w").write("\n".join(lines) + "\n")
print("Wrote backend/requirements.txt:")
print("\n".join(lines))
