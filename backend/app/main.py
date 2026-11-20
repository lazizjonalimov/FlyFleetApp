import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import get_settings
from app.core.crypto import validate_encryption_keys
from app.core.db import assert_restricted_role, get_engine, new_session
from app.core.errors import ErrorResponse, install_error_handlers
from app.core.middleware import RequestContext
from app.modules.access.router import router as access_router
from app.modules.assistant.router import router as assistant_router
from app.modules.customers.portal import router as customer_portal_router
from app.modules.customers.portal import staff_router as customer_portal_users_router
from app.modules.customers.router import router as customers_router
from app.modules.dispatch.driver_router import router as driver_router
from app.modules.dispatch.router import router as dispatch_router
from app.modules.documents.router import router as documents_router
from app.modules.drivers.profile import router as driver_profile_router
from app.modules.drivers.router import router as drivers_router
from app.modules.equipment.router import router as equipment_router
from app.modules.equipment.transfer import router as transfer_router
from app.modules.expenses.router import router as expenses_router
from app.modules.finance.router import router as finance_router
from app.modules.fleet.summary import router as fleet_summary_router
from app.modules.ifta.router import router as ifta_router
from app.modules.intake.router import router as intake_router
from app.modules.integrations.router import router as integrations_router
from app.modules.loads.places_router import router as load_places_router
from app.modules.loads.router import router as loads_router
from app.modules.maintenance.router import router as maintenance_router
from app.modules.messaging.router import router as messaging_router
from app.modules.organizations.account_router import router as account_router
from app.modules.organizations.auth_router import router as auth_router
from app.modules.organizations.combined import router as combined_router
from app.modules.organizations.router import router as organization_router
from app.modules.owners.portal_router import router as owner_portal_router
from app.modules.owners.router import equipment_router as ownership_router
from app.modules.owners.router import router as owners_router
from app.modules.people.router import router as people_router
from app.modules.reports.catalog import router as report_catalog_router
from app.modules.reports.router import router as reports_router
from app.modules.safety.router import router as safety_router
from app.modules.settlements.owner_router import router as owner_settlements_router
from app.modules.settlements.router import router as settlements_router
from app.modules.tasks.router import router as tasks_router
from app.modules.teams.router import router as teams_router
from app.modules.tracking.router import router as tracking_router

DESCRIPTION = """
The FlyFleet transportation management API.

* Every request acts inside one company, taken from the access token. A record that belongs to another
  company answers 404, exactly as if it did not exist.
* Errors share one shape: `{"error": {"code", "message", "field_errors", "details", "request_id"}}`.
* Lists share one shape: `{"items", "page": {"next_cursor", "has_more", "total_count"}, "meta"}` and are
  sorted, filtered and paged in the database.
* Money is sent as decimal strings. Instants are UTC; calendar dates are in the company's time zone.
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Fail closed: never serve requests through a database role that tenant isolation does not apply to.
    assert_restricted_role(get_engine())
    validate_encryption_keys()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    app = FastAPI(title="FlyFleet API", version="0.2.0", description=DESCRIPTION, docs_url="/api/docs",
                  redoc_url=None, openapi_url="/api/openapi.json", lifespan=lifespan)

    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"],
                       allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
                       expose_headers=["X-Request-ID", "Idempotent-Replay"])
    # Added last, so it wraps everything else.
    app.add_middleware(RequestContext, max_body_bytes=settings.max_upload_bytes + 64 * 1024)
    install_error_handlers(app)

    errors = {code: {"model": ErrorResponse} for code in (401, 403, 404, 409, 422)}
    v1 = APIRouter(prefix="/api/v1", responses=errors)
    for router in (auth_router, account_router, organization_router, access_router, customers_router, fleet_summary_router,
                   drivers_router, driver_profile_router, people_router,
                   owners_router, ownership_router, owner_portal_router,
                   equipment_router, loads_router, load_places_router, dispatch_router, driver_router, documents_router,
                   safety_router, maintenance_router, finance_router, expenses_router, owner_settlements_router, intake_router,
                   ifta_router, tracking_router, messaging_router, tasks_router, teams_router, integrations_router,
                   settlements_router, reports_router, report_catalog_router, assistant_router,
                   customer_portal_router, customer_portal_users_router, combined_router, transfer_router):
        v1.include_router(router)
    app.include_router(v1)

    @app.get("/healthz", include_in_schema=False)
    def healthz():
        db = new_session()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
        return {"status": "ok"}

    return app


app = create_app()
