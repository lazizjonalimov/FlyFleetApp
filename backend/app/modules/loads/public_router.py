"""The customer's tracking page: no sign-in, only the link's token. A link that is off or expired answers 404, the
same as one that never existed."""
from fastapi import APIRouter
from fastapi.responses import Response

from app.modules.loads import schemas as s
from app.modules.loads import workflow

router = APIRouter(tags=["public tracking"])


@router.get("/public/tracking/{token}", response_model=s.PublicTracking, summary="A load as its tracking link shows it")
def public_tracking(token: str):
    return workflow.public_tracking(token)


@router.get("/public/tracking/{token}/pod", response_class=Response, summary="The proof of delivery, when shared",
            responses={200: {"content": {"application/pdf": {}, "image/jpeg": {}}}})
def public_pod(token: str):
    content, content_type, name = workflow.public_pod(token)
    return Response(content=content, media_type=content_type,
                    headers={"Content-Disposition": f'inline; filename="{name}"', "Cache-Control": "no-store"})
