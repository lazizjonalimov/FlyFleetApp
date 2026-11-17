"""Imports every model so Base.metadata is complete (used by Alembic and tests)."""
from app.core.db import Base  # noqa: F401
from app.modules.customers.models import Customer, CustomerAddress, CustomerContact  # noqa: F401
from app.modules.dispatch.models import DispatchAssignment  # noqa: F401
from app.modules.documents.models import Document, DocumentLink  # noqa: F401
from app.modules.drivers.models import Driver, DriverQualification  # noqa: F401
from app.modules.equipment.models import Trailer, Vehicle  # noqa: F401
from app.modules.expenses.models import Expense  # noqa: F401
from app.modules.finance.models import Invoice, InvoiceLine, Payment, PaymentAllocation  # noqa: F401
from app.modules.fleet.models import UnitAssignment  # noqa: F401
from app.modules.ifta.models import IftaRate, IftaReturn, IftaTrip, IftaTripMiles  # noqa: F401
from app.modules.intake.models import DocumentRead, Import  # noqa: F401
from app.modules.loads.models import (  # noqa: F401
    Load,
    LoadCharge,
    LoadItem,
    LoadNote,
    LoadStatusEvent,
    LoadStop,
    TrackingEvent,
)
from app.modules.maintenance.models import Inspection, InspectionDefect, WorkOrder, WorkOrderLine  # noqa: F401
from app.modules.messaging.models import Conversation, ConversationRead, Message  # noqa: F401
from app.modules.organizations.models import (  # noqa: F401
    Account,
    AuditLog,
    IdempotencyKey,
    Membership,
    Organization,
    SavedView,
    Terminal,
    User,
    UserPreference,
)
from app.modules.owners.models import EquipmentOwnership, Owner, OwnerAgreement, OwnerContact  # noqa: F401
from app.modules.people.models import Person, PersonDistinction  # noqa: F401
from app.modules.settlements.models import DriverSettlement, SettlementLine  # noqa: F401
from app.modules.settlements.owner_models import OwnerSettlement, OwnerSettlementLine  # noqa: F401
from app.modules.tasks.models import Task  # noqa: F401
from app.modules.tracking.models import (  # noqa: F401
    AlertPolicy,
    AlertPolicyVersion,
    Geofence,
    Incident,
    IncidentEvent,
    VehiclePosition,
)
