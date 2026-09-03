from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("plan/", views.plan_trip, name="plan-trip"),
    path("locations/suggest/", views.suggest_location, name="suggest-location"),
    path("v1/health/", views.health, name="v1-health"),
    path("v1/locations/suggest/", views.suggest_location, name="v1-suggest-location"),
    path("v1/trips/plan/", views.plan_trip, name="v1-plan-trip"),
]
