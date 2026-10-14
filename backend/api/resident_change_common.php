<?php
/**
 * Staff change requests (migration 028).
 *
 * Information that needs the resident's proof or code can't be changed by
 * staff directly (admin_residents.php refuses it). Staff ask instead; the
 * resident makes the change in Edit Profile with the proof (it goes to
 * Profile Approvals like any other change), and approving it closes the
 * request. The state of a request is worked out from pending_profile_changes
 * made after it, so nothing in Edit Profile has to know about requests.
 *
 * Mirrored for display in src/lib/changeRequests.js.
 */

/** key => [label, pending_profile_changes fields, what the resident does, Edit Profile section]. */
const PB2_CHANGE_CATEGORIES = [
    'name'     => ['Name', ['fName', 'mName', 'lName', 'suffix'],
                   'Change your name in Personal Identity and attach a supporting document, such as a birth or marriage certificate.', 'ep-sec-identity'],
    'address'  => ['Address or move-in month', ['house_no', 'block_lot', 'street', 'subdivision', 'zone', 'area', 'landmark', 'residing_since'],
                   'Update it in Residential Address and attach a proof with your name and your Pasong Buaya II address.', 'ep-sec-address'],
    'sectors'  => ['Sector membership', ['is_pwd', 'is_4ps', 'is_solo_parent', 'is_indigent'],
                   'Update it in Sector Membership and attach the document for the sector.', 'ep-sec-sectors'],
    'philsys'  => ['PhilSys number', ['philsys_nat_id'],
                   'Enter your PhilSys number in Personal Identity with photos of the front and back of the card.', 'ep-sec-identity'],
    'id'       => ['Valid ID', ['valid_id_documents'],
                   'Use "Request ID Update" in Valid ID on File with new photos of your ID and a selfie holding it.', 'ep-sec-id'],
    'contact'  => ['Email or mobile number', [],
                   'Change it in Login & Contact and confirm it with the code we send you.', 'ep-sec-account'],
];

/** Record fields staff may not change themselves => the category to ask for. */
const PB2_PROOF_FIELDS = [
    'fName' => 'name', 'mName' => 'name', 'lName' => 'name', 'suffix' => 'name',
    'house_no' => 'address', 'block_lot' => 'address', 'street' => 'address', 'subdivision' => 'address',
    'zone' => 'address', 'area' => 'address', 'landmark' => 'address', 'residing_since' => 'address',
    'is_pwd' => 'sectors', 'is_4ps' => 'sectors', 'is_solo_parent' => 'sectors', 'is_indigent' => 'sectors',
    'philsys_nat_id' => 'philsys', 'valid_id' => 'id',
    'email' => 'contact', 'contact_num' => 'contact',
];

/**
 * The resident's requests with a worked-out state, newest first:
 *   open        waiting for the resident
 *   waiting_code  the change was made but its verification code isn't entered
 *   submitted   the change and proof are waiting for staff (Profile Approvals)
 *   rejected    staff rejected the change; the resident must try again
 *   done / cancelled
 * Requests whose change was approved (or applied, for email/mobile) are closed
 * here as 'done'. $r needs resident_id, user_id, email, contact_num.
 */
function pb2_change_requests(mysqli $conn, array $r, bool $openOnly = false): array
{
    $rid = (int)$r['resident_id'];
    $sql = "SELECT * FROM resident_change_requests WHERE resident_id = ?" . ($openOnly ? " AND status = 'open'" : '') . " ORDER BY request_id DESC LIMIT 30";
    $st = $conn->prepare($sql);
    if (!$st) return [];
    $st->bind_param('i', $rid);
    $st->execute();
    $rows = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    $st->close();

    $uid = (string)$r['user_id'];
    foreach ($rows as &$q) {
        $cat = PB2_CHANGE_CATEGORIES[$q['category']] ?? null;
        $q['label'] = $cat[0] ?? $q['category'];
        $q['help'] = $cat[2] ?? '';
        $q['section'] = $cat[3] ?? null;
        $q['state'] = $q['status'];
        $q['rejection'] = null;
        if ($q['status'] !== 'open' || !$cat) continue;

        if ($q['category'] === 'contact') {
            $snap = json_decode((string)$q['snapshot'], true) ?: [];
            $changed = strtolower((string)($snap['email'] ?? '')) !== strtolower((string)$r['email'])
                    || preg_replace('/\D/', '', (string)($snap['contact_num'] ?? '')) !== preg_replace('/\D/', '', (string)$r['contact_num']);
            if ($changed) $q['state'] = 'done';
        } else {
            $fields = $cat[1];
            $in = implode(',', array_fill(0, count($fields), '?'));
            $st = $conn->prepare("SELECT status, admin_notes FROM pending_profile_changes
                                   WHERE user_id = ? AND created_at >= ? AND field_name IN ($in)
                                   ORDER BY change_id DESC");
            $types = 'ss' . str_repeat('s', count($fields));
            $st->bind_param($types, $uid, $q['created_at'], ...$fields);
            $st->execute();
            $changes = $st->get_result()->fetch_all(MYSQLI_ASSOC);
            $st->close();
            $statuses = array_column($changes, 'status');
            if (in_array('approved', $statuses, true)) $q['state'] = 'done';
            elseif (in_array('pending_approval', $statuses, true)) $q['state'] = 'submitted';
            elseif (in_array('pending_otp', $statuses, true)) $q['state'] = 'waiting_code';
            elseif ($changes && $changes[0]['status'] === 'rejected') {
                $q['state'] = 'rejected';
                $q['rejection'] = $changes[0]['admin_notes'] ?: null;
            }
        }
        if ($q['state'] === 'done') {
            $up = $conn->prepare("UPDATE resident_change_requests SET status = 'done', closed_at = NOW() WHERE request_id = ? AND status = 'open'");
            $id = (int)$q['request_id'];
            $up->bind_param('i', $id);
            $up->execute();
            $up->close();
            $q['status'] = 'done';
        }
    }
    unset($q);
    return $openOnly ? array_values(array_filter($rows, fn($q) => $q['status'] === 'open')) : $rows;
}
