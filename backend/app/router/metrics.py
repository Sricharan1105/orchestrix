from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import schemas, crud, security, models

router = APIRouter(prefix="/metrics", tags=["Metrics"])

@router.get("/overview", response_model=schemas.StatsOverview)
def get_overview_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    return crud.get_system_stats(db)

@router.get("/throughput", response_model=List[schemas.ThroughputDataPoint])
def get_throughput_chart(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    return crud.get_throughput_chart_data(db)
