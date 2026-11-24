"""Single-table DynamoDB store.

    pk                 sk                     item
    HH#<id>            PROFILE                household document
    HH#<id>            ACTION#<action id>     action document (ids sort by time)
    HH#<id>            EVENT#<ts>#<id>        event document
    TOKEN#<sha256>     TOKEN                  household_id + role
"""
from __future__ import annotations

import boto3
from boto3.dynamodb.conditions import Attr, Key

from ..models import Action, Event, Household


class DynamoStore:
    def __init__(self, table_name: str, region: str):
        self.table = boto3.resource("dynamodb", region_name=region).Table(table_name)

    @staticmethod
    def create_table(table_name: str, region: str) -> None:
        """Used by tests and `python -m bharosa.cli init-dynamo` (CloudFormation does this in prod)."""
        boto3.client("dynamodb", region_name=region).create_table(
            TableName=table_name,
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"},
                       {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"},
                                  {"AttributeName": "sk", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

    def _put(self, pk: str, sk: str, doc: str, **extra) -> None:
        self.table.put_item(Item={"pk": pk, "sk": sk, "doc": doc, **extra})

    def _query(self, pk: str, prefix: str, limit: int) -> list[str]:
        resp = self.table.query(KeyConditionExpression=Key("pk").eq(pk) & Key("sk").begins_with(prefix),
                                ScanIndexForward=False, Limit=limit)
        return [i["doc"] for i in resp.get("Items", [])]

    def put_household(self, hh: Household) -> None:
        self._put(f"HH#{hh.id}", "PROFILE", hh.model_dump_json(), entity="household")

    def get_household(self, household_id: str) -> Household | None:
        item = self.table.get_item(Key={"pk": f"HH#{household_id}", "sk": "PROFILE"}).get("Item")
        return Household.model_validate_json(item["doc"]) if item else None

    def list_households(self) -> list[Household]:
        out, kwargs = [], {}
        while True:
            resp = self.table.scan(FilterExpression=Attr("sk").eq("PROFILE"), **kwargs)
            out += [Household.model_validate_json(i["doc"]) for i in resp.get("Items", [])]
            if "LastEvaluatedKey" not in resp:
                return out
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    def put_token(self, token_hash: str, household_id: str, role: str) -> None:
        self.table.put_item(Item={"pk": f"TOKEN#{token_hash}", "sk": "TOKEN",
                                  "household_id": household_id, "role": role})

    def resolve_token(self, token_hash: str) -> tuple[str, str] | None:
        item = self.table.get_item(Key={"pk": f"TOKEN#{token_hash}", "sk": "TOKEN"}).get("Item")
        return (item["household_id"], item["role"]) if item else None

    def put_action(self, action: Action) -> None:
        self._put(f"HH#{action.household_id}", f"ACTION#{action.id}", action.model_dump_json())

    def get_action(self, household_id: str, action_id: str) -> Action | None:
        item = self.table.get_item(Key={"pk": f"HH#{household_id}", "sk": f"ACTION#{action_id}"}).get("Item")
        return Action.model_validate_json(item["doc"]) if item else None

    def list_actions(self, household_id: str, limit: int = 200) -> list[Action]:
        return [Action.model_validate_json(d) for d in self._query(f"HH#{household_id}", "ACTION#", limit)]

    def add_event(self, event: Event) -> None:
        self._put(f"HH#{event.household_id}", f"EVENT#{event.ts:017.6f}#{event.id}", event.model_dump_json())

    def list_events(self, household_id: str, limit: int = 100) -> list[Event]:
        return [Event.model_validate_json(d) for d in self._query(f"HH#{household_id}", "EVENT#", limit)]
