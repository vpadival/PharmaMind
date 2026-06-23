import pytest
from ml_models import PharmaMLModels, ModelNotLoadedError

def test_model_not_loaded_raises_error():
    manager = PharmaMLModels()
    # Force models to be None
    manager.models['shortage'] = None
    manager.models['demand'] = None
    
    with pytest.raises(ModelNotLoadedError):
        manager.predict_shortage(1, 1, 1, 1, 0.1)
        
    with pytest.raises(ModelNotLoadedError):
        manager.predict_demand(1, 1, 0, 2.0)
