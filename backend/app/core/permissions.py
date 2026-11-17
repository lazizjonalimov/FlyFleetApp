"""Role-based access control.

A role belongs to a membership (a user in one company). Roles are fixed sets of permissions defined here; the
API checks a permission on every endpoint. Hiding a button in the web app is presentation, never security.
"""
from enum import StrEnum


class Role(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    DISPATCHER = "dispatcher"
    SAFETY_MANAGER = "safety_manager"
    FLEET_MANAGER = "fleet_manager"
    ACCOUNTANT = "accountant"
    VIEWER = "viewer"        # read-only manager
    DRIVER = "driver"        # driver app only
    CUSTOMER = "customer"    # customer portal only (not built yet)
    OWNER_PORTAL = "owner_portal"  # an equipment owner's sign-in: their own units only, as their permissions allow


ROLE_LABELS = {
    Role.OWNER: ("Main Admin", "Everything, including team & billing"),
    Role.ADMIN: ("Administrator", "Everything except granting ownership"),
    Role.DISPATCHER: ("Dispatcher", "Plans and assigns loads"),
    Role.SAFETY_MANAGER: ("Safety Manager", "Compliance, documents, alerts"),
    Role.FLEET_MANAGER: ("Fleet Manager", "Equipment and maintenance"),
    Role.ACCOUNTANT: ("Accounting", "Invoices, payments, statements"),
    Role.VIEWER: ("Read-only", "Dashboards and reports"),
    Role.DRIVER: ("Driver", "Driver app only: own assignments"),
    Role.CUSTOMER: ("Customer", "Customer portal only"),
    Role.OWNER_PORTAL: ("Equipment owner", "Owner portal · their own equipment"),
}

# Permission catalogue, grouped the way the role matrix screen shows it.
PERMISSION_GROUPS: dict[str, dict[str, str]] = {
    "Overview": {
        "dashboard.read": "See the dashboard",
        "tasks.read": "See and work their own tasks",
        "tasks.assign": "Give tasks to teammates",
        "reports.read": "See reports",
        "reports.export": "Export report data",
    },
    "Operations": {
        "loads.read": "See loads",
        "loads.create": "Create loads",
        "loads.update": "Edit loads, stops and notes",
        "loads.cancel": "Cancel or hold loads",
        "loads.close": "Review proof of delivery and complete loads",
        "loads.rates.read": "See customer rates and charges",
        "dispatch.read": "See the dispatch board",
        "dispatch.assign": "Assign, reassign and dispatch loads",
        "messages.read": "See messages with drivers, customers and teammates",
        "messages.send": "Send messages and start conversations",
    },
    "Fleet tracking": {
        "tracking.read": "See live truck locations and trails",
        "tracking.ingest": "Send truck positions (telematics and other integrations)",
        "incidents.read": "See fleet alerts",
        "incidents.manage": "Acknowledge, assign and resolve fleet alerts",
        "alert_policies.manage": "Change fleet alert policies and geofences",
    },
    "Directory": {
        "customers.read": "See customers",
        "customers.manage": "Create, edit and archive customers",
        "drivers.read": "See drivers",
        "drivers.manage": "Create and edit drivers and qualifications",
        "drivers.sensitive.read": "See full licence numbers and pay settings",
        "equipment.read": "See trucks and trailers",
        "equipment.manage": "Create and edit trucks and trailers",
        "owners.read": "See owners, what they own and their agreements",
        "owners.manage": "Add and edit owners, agreements, ownership and owner portal access",
        "owners.sensitive.read": "See owners' tax IDs and bank details",
    },
    "Safety and fleet": {
        "safety.read": "See compliance status and inspections",
        "safety.manage": "Record inspections and review compliance documents",
        "maintenance.read": "See maintenance work orders",
        "maintenance.manage": "Create and close work orders",
        "documents.read": "See and download documents",
        "documents.upload": "Upload documents",
        "documents.delete": "Remove documents",
    },
    "Finance": {
        "invoices.read": "See invoices",
        "invoices.create": "Create, issue and void invoices",
        "payments.read": "See payments",
        "payments.record": "Record and reverse payments",
        "expenses.read": "See expenses and fuel",
        "expenses.manage": "Record expenses and fuel",
        "settlements.read": "See driver settlements",
        "settlements.manage": "Create, approve and pay settlements",
    },
    "Administration": {
        "users.manage": "Add users and change roles",
        "organization.manage": "Change company settings and terminals",
        "audit.read": "See the audit log",
    },
}

ALL: set[str] = {p for group in PERMISSION_GROUPS.values() for p in group}
READ: set[str] = {p for p in ALL if p.endswith(".read")}

ROLE_PERMISSIONS: dict[Role, set[str]] = {
    Role.OWNER: set(ALL),
    Role.ADMIN: set(ALL),
    # Plans and assigns loads. No money, and no finance or safety records unless the company grants them.
    Role.DISPATCHER: {
        "dashboard.read", "reports.read", "tasks.read", "tasks.assign", "messages.read", "messages.send",
        "loads.read", "loads.create", "loads.update", "loads.cancel", "loads.close",
        "dispatch.read", "dispatch.assign",
        "customers.read", "drivers.read", "equipment.read", "owners.read",
        "maintenance.read", "documents.read", "documents.upload",
        "tracking.read", "incidents.read", "incidents.manage",
    },
    # Compliance, documents and alerts: sees the operation, doesn't dispatch it.
    Role.SAFETY_MANAGER: {
        "dashboard.read", "reports.read", "tasks.read", "tasks.assign", "messages.read", "messages.send",
        "loads.read", "customers.read",
        "drivers.read", "drivers.manage", "drivers.sensitive.read", "equipment.read", "owners.read",
        "safety.read", "safety.manage", "maintenance.read",
        "documents.read", "documents.upload", "documents.delete",
        "tracking.read", "incidents.read", "incidents.manage", "alert_policies.manage",
    },
    # Equipment and maintenance, with the inspections that keep it on the road.
    Role.FLEET_MANAGER: {
        "dashboard.read", "reports.read", "tasks.read", "tasks.assign", "messages.read", "messages.send",
        "loads.read", "dispatch.read", "drivers.read",
        "equipment.read", "equipment.manage", "owners.read", "safety.read", "safety.manage",
        "maintenance.read", "maintenance.manage",
        "documents.read", "documents.upload",
        "tracking.read", "incidents.read", "incidents.manage",
    },
    Role.ACCOUNTANT: {
        "dashboard.read", "reports.read", "reports.export", "tasks.read", "tasks.assign",
        "messages.read", "messages.send",
        "loads.read", "loads.rates.read", "loads.close", "customers.read", "drivers.read",
        "drivers.sensitive.read", "equipment.read", "owners.read", "owners.sensitive.read",
        "documents.read", "documents.upload",
        "invoices.read", "invoices.create", "payments.read", "payments.record",
        "expenses.read", "expenses.manage", "settlements.read", "settlements.manage",
    },
    Role.VIEWER: set(READ) - {"audit.read", "drivers.sensitive.read", "owners.sensitive.read"},
    # Drivers use only /driver/* endpoints, which are tied to their own released assignments.
    Role.DRIVER: {"driver.self"},
    Role.CUSTOMER: set(),
    # Portal reads only, further limited per owner by the switches the company sets (owners.portal_permissions).
    Role.OWNER_PORTAL: {"owner_portal.read"},
}

# Roles that can be given to staff from the team screen.
ASSIGNABLE = [r for r in Role if r not in (Role.CUSTOMER, Role.OWNER_PORTAL)]


def permissions_for(role: str) -> set[str]:
    try:
        return ROLE_PERMISSIONS[Role(role)]
    except (ValueError, KeyError):
        return set()


def has_permission(role: str, permission: str) -> bool:
    return permission in permissions_for(role)


# ---------------------------------------------------------------- roles a company can change
# Roles FlyFleet keeps as they are: full access, and the roles of the driver app and the owner portal.
LOCKED_ROLES = {Role.OWNER, Role.ADMIN, Role.DRIVER, Role.CUSTOMER, Role.OWNER_PORTAL}
# Roles that never reach the console, so they are never given to staff or to a custom role.
APP_ROLES = {Role.DRIVER.value, Role.CUSTOMER.value, Role.OWNER_PORTAL.value}
# Only full-access roles hold these: no edited, custom or overridden role is given them.
NOT_GRANTABLE = {"users.manage"}

ACTIONS = ("View", "Create", "Edit", "Assign", "Approve", "Delete", "Export")

# The role editor's grid: each module, the actions it has and the permission each action is. An action a module
# doesn't have shows as a dash. Every permission a role can be given appears exactly once.
MATRIX: list[tuple[str, list[dict]]] = [
    ("Overview", [
        {"key": "dashboard", "label": "Dashboard", "cells": {"View": "dashboard.read"}},
        {"key": "tasks", "label": "My tasks", "cells": {"View": "tasks.read", "Assign": "tasks.assign"}},
        {"key": "reports", "label": "Reports", "cells": {"View": "reports.read", "Export": "reports.export"}},
    ]),
    ("Operations", [
        {"key": "dispatch", "label": "Dispatch board", "cells": {"View": "dispatch.read", "Assign": "dispatch.assign"}},
        {"key": "loads", "label": "Loads", "cells": {"View": "loads.read", "Create": "loads.create",
                                                    "Edit": "loads.update", "Approve": "loads.close",
                                                    "Delete": "loads.cancel"}},
        {"key": "rates", "label": "Load rates & revenue", "sensitive": True, "note": "rates, pay, margin",
         "cells": {"View": "loads.rates.read"}},
        {"key": "messages", "label": "Messages", "cells": {"View": "messages.read", "Create": "messages.send"}},
    ]),
    ("Fleet tracking", [
        {"key": "tracking", "label": "Live fleet & trip history", "note": "create: positions from integrations",
         "cells": {"View": "tracking.read", "Create": "tracking.ingest"}},
        {"key": "alerts", "label": "Fleet alerts", "cells": {"View": "incidents.read", "Assign": "incidents.manage"}},
        {"key": "policies", "label": "Alert policies & geofences", "cells": {"Edit": "alert_policies.manage"}},
    ]),
    ("Directory", [
        {"key": "customers", "label": "Customers", "cells": {"View": "customers.read", "Edit": "customers.manage"}},
        {"key": "drivers", "label": "Drivers", "cells": {"View": "drivers.read", "Edit": "drivers.manage"}},
        {"key": "driver_ids", "label": "Driver sensitive IDs", "sensitive": True, "note": "license #, birth date",
         "cells": {"View": "drivers.sensitive.read"}},
        {"key": "owners", "label": "Owners", "cells": {"View": "owners.read", "Edit": "owners.manage"}},
        {"key": "owner_tax", "label": "Owner tax IDs and bank", "sensitive": True, "note": "EIN or SSN, payout bank",
         "cells": {"View": "owners.sensitive.read"}},
    ]),
    ("Safety & fleet", [
        {"key": "safety", "label": "Compliance & inspections", "cells": {"View": "safety.read", "Edit": "safety.manage"}},
        {"key": "documents", "label": "Documents", "cells": {"View": "documents.read", "Create": "documents.upload",
                                                            "Delete": "documents.delete"}},
        {"key": "equipment", "label": "Trucks & trailers", "cells": {"View": "equipment.read", "Edit": "equipment.manage"}},
        {"key": "maintenance", "label": "Maintenance", "cells": {"View": "maintenance.read",
                                                                "Edit": "maintenance.manage"}},
    ]),
    ("Finance", [
        {"key": "invoices", "label": "Invoices", "cells": {"View": "invoices.read", "Create": "invoices.create"}},
        {"key": "payments", "label": "Payments", "cells": {"View": "payments.read", "Create": "payments.record"}},
        {"key": "expenses", "label": "Expenses, fuel & IFTA", "cells": {"View": "expenses.read",
                                                                       "Edit": "expenses.manage"}},
        {"key": "settlements", "label": "Driver statements & settlements", "cells": {"View": "settlements.read",
                                                                                     "Approve": "settlements.manage"}},
    ]),
    ("Administration", [
        {"key": "team", "label": "Team & access", "locked": True, "note": "Owner and administrators only",
         "cells": {"Edit": "users.manage"}},
        {"key": "settings", "label": "Organization settings", "cells": {"Edit": "organization.manage"}},
        {"key": "audit", "label": "Audit log", "cells": {"View": "audit.read"}},
    ]),
]
GRANTABLE: set[str] = {perm for _, rows in MATRIX for row in rows for perm in row["cells"].values()} - NOT_GRANTABLE
